import Link from "next/link";
import type { AppointmentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { ButtonLink, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { AppointmentStatusBadge } from "@/components/status";
import { formatDateTime, startOfDayUtc, toDateKey } from "@/lib/time";
import { formatCents } from "@/lib/money";
import { STATUS_LABELS } from "@/lib/booking/status";

export const metadata = { title: "Appointments" };

const VIEWS: Record<string, { label: string; where: (now: Date, todayStart: Date) => Prisma.AppointmentWhereInput }> = {
  requests: { label: "Booking requests", where: () => ({ status: "REQUESTED" }) },
  upcoming: { label: "Upcoming", where: (now) => ({ startsAt: { gte: now }, status: { notIn: ["CANCELED", "NO_SHOW", "COMPLETED"] } }) },
  today: { label: "Today", where: (_n, t) => ({ startsAt: { gte: t, lt: new Date(t.getTime() + 86400_000) } }) },
  past: { label: "Past", where: (now) => ({ startsAt: { lt: now } }) },
  all: { label: "All", where: () => ({}) },
};

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("appointments:view", "/admin/appointments");
  const sp = await searchParams;
  const biz = await getSettings("business");
  const view = sp.view && VIEWS[sp.view] ? sp.view : "upcoming";
  const now = new Date();
  const todayStart = startOfDayUtc(toDateKey(now, biz.timeZone), biz.timeZone);
  const where: Prisma.AppointmentWhereInput = { ...VIEWS[view].where(now, todayStart) };
  if (sp.status && sp.status in STATUS_LABELS) where.status = sp.status as AppointmentStatus;
  if (sp.tech) where.technicianId = sp.tech === "none" ? null : sp.tech;
  const [appointments, techs, requestCount] = await Promise.all([
    prisma.appointment.findMany({
      where,
      orderBy: { startsAt: view === "past" ? "desc" : "asc" },
      take: 200,
      include: { customer: true, service: true, technician: true, address: true, facility: true },
    }),
    prisma.technician.findMany({ where: { isActive: true }, orderBy: { displayName: "asc" } }),
    prisma.appointment.count({ where: { status: "REQUESTED" } }),
  ]);
  return (
    <div>
      <PageHeader
        title="Appointments"
        description={`${requestCount} booking request${requestCount === 1 ? "" : "s"} waiting for review.`}
        actions={
          <>
            <ButtonLink href="/admin/calendar" variant="outline">
              Calendar
            </ButtonLink>
            <ButtonLink href="/admin/appointments/new">New appointment</ButtonLink>
          </>
        }
      />
      <nav aria-label="Appointment views" className="mb-4 flex flex-wrap gap-2">
        {Object.entries(VIEWS).map(([key, v]) => (
          <Link
            key={key}
            href={`/admin/appointments?view=${key}`}
            aria-current={key === view ? "page" : undefined}
            className={`rounded-full border px-4 py-1.5 font-semibold no-underline ${key === view ? "border-navy bg-navy text-white" : "border-line bg-white text-navy"}`}
          >
            {v.label}
            {key === "requests" && requestCount > 0 ? ` (${requestCount})` : ""}
          </Link>
        ))}
      </nav>
      <form className="mb-4 flex flex-wrap items-end gap-3" method="get">
        <input type="hidden" name="view" value={view} />
        <div>
          <label htmlFor="status" className="block text-sm font-semibold text-navy">
            Status
          </label>
          <select id="status" name="status" defaultValue={sp.status ?? ""} className="rounded-md border-2 border-line px-3 py-2">
            <option value="">Any</option>
            {Object.entries(STATUS_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tech" className="block text-sm font-semibold text-navy">
            Technician
          </label>
          <select id="tech" name="tech" defaultValue={sp.tech ?? ""} className="rounded-md border-2 border-line px-3 py-2">
            <option value="">Any</option>
            <option value="none">Unassigned</option>
            {techs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.displayName}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-md bg-navy px-4 py-2 font-semibold text-white">
          Filter
        </button>
      </form>
      {appointments.length === 0 ? (
        <EmptyState title="No appointments match">Try a different view or filter.</EmptyState>
      ) : (
        <Table caption="Appointments">
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Customer</Th>
              <Th>Service</Th>
              <Th>Location</Th>
              <Th>Technician</Th>
              <Th>Status</Th>
              <Th>Estimate</Th>
            </tr>
          </thead>
          <tbody>
            {appointments.map((a) => (
              <tr key={a.id} className="hover:bg-soft">
                <Td>
                  <Link href={`/admin/appointments/${a.id}`} className="font-semibold">
                    {formatDateTime(a.startsAt, biz.timeZone)}
                  </Link>
                  <span className="block font-mono text-xs">{a.reference}</span>
                </Td>
                <Td>
                  <Link href={`/admin/customers/${a.customerId}`}>
                    {a.customer.firstName} {a.customer.lastName}
                  </Link>
                  {!a.bookedForSelf && <span className="block text-xs">Booked by {a.requesterName}</span>}
                </Td>
                <Td>{a.service.name}</Td>
                <Td>{a.isRemote ? "Remote" : a.facility ? a.facility.name : (a.address?.city ?? "—")}</Td>
                <Td>{a.technician?.displayName ?? <span className="text-warn">Unassigned</span>}</Td>
                <Td>
                  <AppointmentStatusBadge status={a.status} />
                </Td>
                <Td>{a.estimatedTotalCents != null ? formatCents(a.estimatedTotalCents) : "Quote"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
