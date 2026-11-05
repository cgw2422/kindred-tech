import Link from "next/link";
import type { Metadata } from "next";
import { EmptyState } from "@/components/ui";
import { AppointmentStatusBadge } from "@/components/status";
import { listTechAppointments, shortCustomerName } from "@/lib/tech/access";
import { addDaysToKey, formatDate, formatDateKeyLong, formatTime, toDateKey } from "@/lib/time";
import { getTechContext } from "./_lib/context";
import { AppointmentCard } from "./_components/AppointmentCard";

export const metadata: Metadata = { title: "Today" };

function validKey(v: string | string[] | undefined): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}

const navBtn = "flex min-h-[48px] items-center justify-center rounded-md border-2 border-navy bg-white px-4 font-semibold text-navy no-underline";

export default async function TechTodayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { technician, tz } = await getTechContext();
  if (!technician) return null;
  const sp = await searchParams;
  const todayKey = toDateKey(new Date(), tz);
  const dayKey = validKey(sp.date) ?? todayKey;
  const isToday = dayKey === todayKey;

  const [appointments, upcoming] = await Promise.all([
    listTechAppointments(technician.id, dayKey, 1, tz),
    listTechAppointments(technician.id, addDaysToKey(dayKey, 1), 7, tz),
  ]);

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wider text-green">Hello, {technician.displayName}</p>
      <h1 className="text-2xl">{isToday ? "Today's jobs" : "Jobs"}</h1>
      <p className="text-body">{formatDateKeyLong(dayKey)}</p>

      <nav aria-label="Change day" className="mt-4 grid grid-cols-3 gap-2">
        <Link href={`/tech?date=${addDaysToKey(dayKey, -1)}`} className={navBtn}>
          <span aria-hidden="true">‹&nbsp;</span>Prev<span className="sr-only">ious day</span>
        </Link>
        <Link href="/tech" className={`${navBtn} ${isToday ? "border-green bg-green-light" : ""}`} aria-current={isToday ? "date" : undefined}>
          Today
        </Link>
        <Link href={`/tech?date=${addDaysToKey(dayKey, 1)}`} className={navBtn}>
          Next<span className="sr-only"> day</span>
          <span aria-hidden="true">&nbsp;›</span>
        </Link>
      </nav>

      <section aria-labelledby="day-jobs" className="mt-5">
        <h2 id="day-jobs" className="sr-only">
          Jobs on {formatDateKeyLong(dayKey)}
        </h2>
        {appointments.length === 0 ? (
          <EmptyState title="No jobs scheduled">Nothing is assigned to you on this day.</EmptyState>
        ) : (
          <ol className="space-y-3">
            {appointments.map((a) => (
              <li key={a.id}>
                <AppointmentCard appt={a} tz={tz} />
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="upcoming" className="mt-8">
        <h2 id="upcoming" className="text-xl">
          Next 7 days
        </h2>
        {upcoming.length === 0 ? (
          <p className="mt-2 text-body">No upcoming jobs in the next week.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-white">
            {upcoming.map((a) => (
              <li key={a.id}>
                <Link href={`/tech/appointments/${a.id}`} className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-3 no-underline hover:bg-navy-50">
                  <span>
                    <span className="block font-semibold text-navy">
                      {formatDate(a.startsAt, tz, { weekday: "short", month: "short", day: "numeric", year: undefined })} · {formatTime(a.startsAt, tz)}
                    </span>
                    <span className="block text-sm text-body">
                      {shortCustomerName(a.customer)} — {a.service.name}
                      {a.address ? `, ${a.address.city}` : ""}
                    </span>
                  </span>
                  <AppointmentStatusBadge status={a.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
