import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { ButtonLink, PageHeader } from "@/components/ui";
import { STATUS_LABELS } from "@/lib/booking/status";
import { addDaysToKey, formatDateKeyLong, formatTime, parseDateKey, startOfDayUtc, toDateKey, weekdayOfKey, zonedParts } from "@/lib/time";

export const metadata = { title: "Calendar" };

type View = "day" | "week" | "month";
const DAY_START = 7 * 60;
const DAY_END = 19 * 60;
const PX_PER_MIN = 1.1;

function monthStart(key: string) {
  const { year, month } = parseDateKey(key);
  return `${year}-${String(month).padStart(2, "0")}-01`;
}
function daysInMonth(key: string) {
  const { year, month } = parseDateKey(key);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("appointments:view", "/admin/calendar");
  const sp = await searchParams;
  const biz = await getSettings("business");
  const tz = biz.timeZone;
  const view: View = sp.view === "day" || sp.view === "month" ? sp.view : "week";
  const anchor = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : toDateKey(new Date(), tz);

  let startKey: string;
  let numDays: number;
  if (view === "day") {
    startKey = anchor;
    numDays = 1;
  } else if (view === "week") {
    startKey = addDaysToKey(anchor, -weekdayOfKey(anchor));
    numDays = 7;
  } else {
    const ms = monthStart(anchor);
    startKey = addDaysToKey(ms, -weekdayOfKey(ms));
    const end = addDaysToKey(ms, daysInMonth(ms) - 1);
    numDays = Math.ceil((weekdayOfKey(ms) + daysInMonth(ms) + (6 - weekdayOfKey(end))) / 7) * 7;
  }
  const rangeStart = startOfDayUtc(startKey, tz);
  const rangeEnd = startOfDayUtc(addDaysToKey(startKey, numDays), tz);

  const [appointments, helpDays, techs, blackouts] = await Promise.all([
    prisma.appointment.findMany({
      where: { startsAt: { gte: rangeStart, lt: rangeEnd }, status: { notIn: ["CANCELED"] }, ...(sp.tech ? { technicianId: sp.tech } : {}) },
      include: { customer: true, service: true, technician: true },
      orderBy: { startsAt: "asc" },
    }),
    prisma.techHelpDay.findMany({ where: { startsAt: { gte: rangeStart, lt: rangeEnd }, status: { not: "CANCELED" }, ...(sp.tech ? { technicianId: sp.tech } : {}) }, include: { facility: true, technician: true } }),
    prisma.technician.findMany({ where: { isActive: true }, orderBy: { displayName: "asc" } }),
    prisma.blackout.findMany({ where: { startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart } }, include: { technician: true } }),
  ]);

  const days = Array.from({ length: numDays }, (_, i) => addDaysToKey(startKey, i));
  const byDay = (key: string) => appointments.filter((a) => toDateKey(a.startsAt, tz) === key);
  const helpByDay = (key: string) => helpDays.filter((h) => toDateKey(h.startsAt, tz) === key);
  const blackoutsByDay = (key: string) => {
    const s = startOfDayUtc(key, tz);
    const e = startOfDayUtc(addDaysToKey(key, 1), tz);
    return blackouts.filter((b) => b.startsAt < e && b.endsAt > s);
  };
  const prevKey = view === "day" ? addDaysToKey(anchor, -1) : view === "week" ? addDaysToKey(anchor, -7) : addDaysToKey(monthStart(anchor), -1);
  const nextKey = view === "day" ? addDaysToKey(anchor, 1) : view === "week" ? addDaysToKey(anchor, 7) : addDaysToKey(monthStart(anchor), daysInMonth(anchor) + 1);
  const qs = (o: Record<string, string>) => {
    const p = new URLSearchParams({ view, date: anchor, ...(sp.tech ? { tech: sp.tech } : {}), ...o });
    return `/admin/calendar?${p}`;
  };
  const minutesOf = (d: Date) => {
    const p = zonedParts(d, tz);
    return p.hour * 60 + p.minute;
  };
  const statusColor = (s: string) => (s === "REQUESTED" ? "border-warn bg-warn-light" : s === "COMPLETED" ? "border-gray-400 bg-gray-100" : s === "NO_SHOW" ? "border-danger bg-danger-light" : "border-navy bg-navy-50");
  const title =
    view === "month"
      ? new Date(Date.UTC(parseDateKey(anchor).year, parseDateKey(anchor).month - 1, 15)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
      : view === "week"
        ? `Week of ${formatDateKeyLong(startKey)}`
        : formatDateKeyLong(anchor);

  return (
    <div>
      <PageHeader title="Calendar" description={title} actions={<ButtonLink href="/admin/appointments/new">New appointment</ButtonLink>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={qs({ date: prevKey })} className="rounded-md border-2 border-navy px-3 py-1.5 font-semibold no-underline">
          Previous
        </Link>
        <Link href={qs({ date: toDateKey(new Date(), tz) })} className="rounded-md border-2 border-navy px-3 py-1.5 font-semibold no-underline">
          Today
        </Link>
        <Link href={qs({ date: nextKey })} className="rounded-md border-2 border-navy px-3 py-1.5 font-semibold no-underline">
          Next
        </Link>
        <span className="mx-2 h-6 w-px bg-line" aria-hidden="true" />
        {(["day", "week", "month"] as View[]).map((v) => (
          <Link key={v} href={qs({ view: v })} aria-current={v === view ? "page" : undefined} className={`rounded-md px-3 py-1.5 font-semibold capitalize no-underline ${v === view ? "bg-navy text-white" : "border border-line bg-white"}`}>
            {v}
          </Link>
        ))}
        <form method="get" className="ml-auto flex items-center gap-2">
          <input type="hidden" name="view" value={view} />
          <input type="hidden" name="date" value={anchor} />
          <label htmlFor="tech" className="text-sm font-semibold">
            Technician
          </label>
          <select id="tech" name="tech" defaultValue={sp.tech ?? ""} className="rounded-md border-2 border-line px-2 py-1.5">
            <option value="">All</option>
            {techs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.displayName}
              </option>
            ))}
          </select>
          <button className="rounded-md bg-navy px-3 py-1.5 font-semibold text-white">Apply</button>
        </form>
      </div>

      {view === "month" ? (
        <div className="overflow-x-auto">
          <div className="grid min-w-[760px] grid-cols-7 border-l border-t border-line bg-white">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="border-b border-r border-line bg-soft px-2 py-1 text-sm font-bold text-navy">
                {d}
              </div>
            ))}
            {days.map((key) => {
              const appts = byDay(key);
              const inMonth = key.slice(0, 7) === anchor.slice(0, 7);
              return (
                <div key={key} className={`min-h-28 border-b border-r border-line p-1.5 ${inMonth ? "" : "bg-soft/60 text-body/60"}`}>
                  <Link href={qs({ view: "day", date: key })} className="text-sm font-bold no-underline">
                    {parseDateKey(key).day}
                  </Link>
                  {blackoutsByDay(key).map((b) => (
                    <div key={b.id} className="mt-1 truncate rounded bg-gray-200 px-1 text-xs">
                      {b.technician ? `${b.technician.displayName}: ` : ""}
                      {b.reason ?? b.type.toLowerCase()}
                    </div>
                  ))}
                  {helpByDay(key).map((h) => (
                    <Link key={h.id} href={`/admin/help-days/${h.id}`} className="mt-1 block truncate rounded bg-green-light px-1 text-xs text-green-dark no-underline">
                      {formatTime(h.startsAt, tz)} Help Day: {h.facility.name}
                    </Link>
                  ))}
                  {appts.slice(0, 4).map((a) => (
                    <Link key={a.id} href={`/admin/appointments/${a.id}`} className={`mt-1 block truncate rounded border-l-4 px-1 text-xs no-underline ${statusColor(a.status)}`}>
                      {formatTime(a.startsAt, tz)} {a.customer.lastName}
                    </Link>
                  ))}
                  {appts.length > 4 && <span className="text-xs">+{appts.length - 4} more</span>}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <div className="grid" style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(${view === "day" ? 300 : 130}px, 1fr))`, minWidth: view === "day" ? 400 : 980 }}>
            <div className="border-b border-line bg-soft" />
            {days.map((key) => (
              <div key={key} className="border-b border-l border-line bg-soft px-2 py-2 text-center">
                <Link href={qs({ view: "day", date: key })} className="font-bold no-underline">
                  {formatDateKeyLong(key).replace(/, \d{4}$/, "")}
                </Link>
              </div>
            ))}
            <div className="relative" style={{ height: (DAY_END - DAY_START) * PX_PER_MIN }}>
              {Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => (
                <div key={i} className="absolute right-1 text-xs text-body" style={{ top: i * 60 * PX_PER_MIN }}>
                  {((DAY_START / 60 + i - 1) % 12) + 1}
                  {DAY_START / 60 + i < 12 ? "am" : "pm"}
                </div>
              ))}
            </div>
            {days.map((key) => (
              <div key={key} className="relative border-l border-line" style={{ height: (DAY_END - DAY_START) * PX_PER_MIN }}>
                {Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => (
                  <div key={i} className="absolute inset-x-0 border-t border-line/60" style={{ top: i * 60 * PX_PER_MIN }} />
                ))}
                {blackoutsByDay(key).map((b) => {
                  const s = Math.max(DAY_START, toDateKey(b.startsAt, tz) === key ? minutesOf(b.startsAt) : 0);
                  const e = Math.min(DAY_END, toDateKey(b.endsAt, tz) === key ? minutesOf(b.endsAt) : 1440);
                  if (e <= s) return null;
                  return (
                    <div key={b.id} className="absolute inset-x-0 bg-gray-200/70 px-1 text-xs" style={{ top: (s - DAY_START) * PX_PER_MIN, height: (e - s) * PX_PER_MIN }}>
                      {b.technician ? `${b.technician.displayName}: ` : "Closed: "}
                      {b.reason ?? b.type.toLowerCase()}
                    </div>
                  );
                })}
                {helpByDay(key).map((h) => {
                  const s = minutesOf(h.startsAt);
                  const e = minutesOf(h.endsAt);
                  return (
                    <Link
                      key={h.id}
                      href={`/admin/help-days/${h.id}`}
                      className="absolute inset-x-1 overflow-hidden rounded border-l-4 border-green bg-green-light/80 px-1 text-xs text-green-dark no-underline"
                      style={{ top: (Math.max(s, DAY_START) - DAY_START) * PX_PER_MIN, height: Math.max(20, (Math.min(e, DAY_END) - Math.max(s, DAY_START)) * PX_PER_MIN) }}
                    >
                      Tech Help Day: {h.facility.name}
                    </Link>
                  );
                })}
                {byDay(key)
                  .filter((a) => !a.techHelpDayId)
                  .map((a) => {
                    const s = minutesOf(a.startsAt);
                    const e = minutesOf(a.endsAt);
                    const lane = view === "day" && techs.length > 1 ? Math.max(0, techs.findIndex((t) => t.id === a.technicianId)) : 0;
                    const lanes = view === "day" && techs.length > 1 ? techs.length : 1;
                    return (
                      <Link
                        key={a.id}
                        href={`/admin/appointments/${a.id}`}
                        className={`absolute overflow-hidden rounded border-l-4 px-1 py-0.5 text-xs no-underline ${statusColor(a.status)}`}
                        style={{
                          top: (Math.max(s, DAY_START) - DAY_START) * PX_PER_MIN,
                          height: Math.max(22, (Math.min(e, DAY_END) - Math.max(s, DAY_START)) * PX_PER_MIN),
                          left: `calc(${(lane / lanes) * 100}% + 2px)`,
                          width: `calc(${100 / lanes}% - 4px)`,
                          borderLeftColor: a.technician?.color,
                        }}
                        title={`${formatTime(a.startsAt, tz)} ${a.customer.firstName} ${a.customer.lastName} - ${a.service.name} (${STATUS_LABELS[a.status]})`}
                      >
                        <span className="font-bold">{formatTime(a.startsAt, tz)}</span> {a.customer.lastName}
                        <span className="block truncate">{a.service.name}</span>
                        <span className="block truncate">{a.technician?.displayName ?? "Unassigned"} · {STATUS_LABELS[a.status]}</span>
                      </Link>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="mt-3 text-sm">
        Legend: yellow = requested (needs review), blue = confirmed/assigned, green = Tech Help Day, gray = completed or closed time. The left border color identifies the technician.
      </p>
    </div>
  );
}
