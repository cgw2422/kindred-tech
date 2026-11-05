import Link from "next/link";
import type { Metadata } from "next";
import { AppointmentStatusBadge } from "@/components/status";
import { addressLine, listTechAppointments, shortCustomerName } from "@/lib/tech/access";
import { addDaysToKey, formatDateKeyLong, formatTime, toDateKey, weekdayOfKey } from "@/lib/time";
import { getTechContext } from "../_lib/context";

export const metadata: Metadata = { title: "My week" };

const navBtn = "flex min-h-[48px] items-center justify-center rounded-md border-2 border-navy bg-white px-4 font-semibold text-navy no-underline";

function validKey(v: string | string[] | undefined): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}

/** Monday of the week containing key. */
function weekStart(key: string) {
  const dow = weekdayOfKey(key);
  return addDaysToKey(key, dow === 0 ? -6 : 1 - dow);
}

export default async function TechSchedulePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { technician, tz } = await getTechContext();
  if (!technician) return null;
  const sp = await searchParams;
  const todayKey = toDateKey(new Date(), tz);
  const start = weekStart(validKey(sp.week) ?? todayKey);
  const appts = await listTechAppointments(technician.id, start, 7, tz);
  const days = Array.from({ length: 7 }, (_, i) => addDaysToKey(start, i));
  const byDay = new Map<string, typeof appts>();
  for (const a of appts) {
    const k = toDateKey(a.startsAt, tz);
    byDay.set(k, [...(byDay.get(k) ?? []), a]);
  }

  return (
    <div>
      <h1 className="text-2xl">My week</h1>
      <p className="text-body">
        Week of {formatDateKeyLong(start)} · {appts.length} {appts.length === 1 ? "job" : "jobs"}
      </p>
      <nav aria-label="Change week" className="mt-4 grid grid-cols-3 gap-2">
        <Link href={`/tech/schedule?week=${addDaysToKey(start, -7)}`} className={navBtn}>
          <span aria-hidden="true">‹&nbsp;</span>Prev<span className="sr-only">ious week</span>
        </Link>
        <Link href="/tech/schedule" className={navBtn}>
          This week
        </Link>
        <Link href={`/tech/schedule?week=${addDaysToKey(start, 7)}`} className={navBtn}>
          Next<span className="sr-only"> week</span>
          <span aria-hidden="true">&nbsp;›</span>
        </Link>
      </nav>

      <div className="mt-5 space-y-5">
        {days.map((key) => {
          const list = byDay.get(key) ?? [];
          return (
            <section key={key} aria-labelledby={`d-${key}`}>
              <h2 id={`d-${key}`} className={`mb-2 text-lg ${key === todayKey ? "text-green-dark" : ""}`}>
                {formatDateKeyLong(key).replace(/, \d{4}$/, "")}
                {key === todayKey && <span className="ml-2 text-sm font-semibold">(today)</span>}
              </h2>
              {list.length === 0 ? (
                <p className="rounded-md border border-dashed border-line bg-white px-4 py-3 text-body">No jobs</p>
              ) : (
                <ul className="divide-y divide-line rounded-lg border border-line bg-white">
                  {list.map((a) => (
                    <li key={a.id}>
                      <Link href={`/tech/appointments/${a.id}`} className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-3 no-underline hover:bg-navy-50">
                        <span className="min-w-0">
                          <span className="block font-semibold text-navy">
                            {formatTime(a.startsAt, tz)} – {formatTime(a.endsAt, tz)} · {shortCustomerName(a.customer)}
                          </span>
                          <span className="block text-sm text-body">{a.service.name}</span>
                          <span className="block truncate text-sm text-body">{a.isRemote ? "Remote session" : addressLine(a.address)}</span>
                        </span>
                        <AppointmentStatusBadge status={a.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
