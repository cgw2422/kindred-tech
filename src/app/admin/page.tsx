import Link from "next/link";
import { prisma } from "@/lib/db";
import { communityMessageWhere, residentialMessageWhere } from "@/lib/leads";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { integrationStatus } from "@/lib/env";
import { ButtonLink, Card, EmptyState, Notice, PageHeader, Stat } from "@/components/ui";
import { AppointmentStatusBadge } from "@/components/status";
import { addDaysToKey, formatDate, formatDateTime, formatTime, parseDateKey, startOfDayUtc, toDateKey } from "@/lib/time";
import { formatCents } from "@/lib/money";

export const metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  const user = await requirePermission("dashboard:view", "/admin");
  const biz = await getSettings("business");
  const tz = biz.timeZone;
  const now = new Date();
  const todayKey = toDateKey(now, tz);
  const todayStart = startOfDayUtc(todayKey, tz);
  const tomorrowStart = startOfDayUtc(addDaysToKey(todayKey, 1), tz);
  const weekEnd = startOfDayUtc(addDaysToKey(todayKey, 8), tz);
  const { year, month } = parseDateKey(todayKey);
  const monthStart = startOfDayUtc(`${year}-${String(month).padStart(2, "0")}-01`, tz);
  const showBilling = can(user.role, "billing:view");

  const [today, upcoming, pending, monthPayments, outstanding, activeMemberships, recentCustomers, helpDays, newMessages, newInquiries, invoiceRequests, newCommunityMessages] = await Promise.all([
    prisma.appointment.findMany({
      where: { startsAt: { gte: todayStart, lt: tomorrowStart }, status: { notIn: ["CANCELED"] } },
      include: { customer: true, service: true, technician: true, address: true },
      orderBy: { startsAt: "asc" },
    }),
    prisma.appointment.findMany({
      where: { startsAt: { gte: tomorrowStart, lt: weekEnd }, status: { in: ["CONFIRMED", "ASSIGNED", "REQUESTED"] } },
      include: { customer: true, service: true, technician: true },
      orderBy: { startsAt: "asc" },
      take: 12,
    }),
    prisma.appointment.findMany({ where: { status: "REQUESTED" }, include: { customer: true, service: true }, orderBy: { startsAt: "asc" }, take: 10 }),
    prisma.payment.aggregate({ where: { status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] }, receivedAt: { gte: monthStart } }, _sum: { amountCents: true, refundedCents: true } }),
    prisma.invoice.findMany({ where: { status: { in: ["OPEN", "PARTIALLY_PAID"] } }, select: { totalCents: true, amountPaidCents: true, amountRefundedCents: true, dueAt: true } }),
    prisma.membership.findMany({ where: { status: "ACTIVE" }, include: { plan: true } }),
    prisma.customer.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.techHelpDay.findMany({ where: { startsAt: { gte: todayStart }, status: { in: ["SCHEDULED", "CONFIRMED"] } }, include: { facility: true, _count: { select: { appointments: true } } }, orderBy: { startsAt: "asc" }, take: 5 }),
    prisma.contactMessage.count({ where: { status: "NEW", ...residentialMessageWhere } }),
    prisma.facilityInquiry.count({ where: { status: "NEW" } }),
    prisma.workOrder.count({ where: { invoiceRequestedAt: { not: null }, appointment: { invoices: { none: {} } } } }),
    prisma.contactMessage.count({ where: { status: "NEW", ...communityMessageWhere } }),
  ]);

  const revenue = (monthPayments._sum.amountCents ?? 0) - (monthPayments._sum.refundedCents ?? 0);
  const outstandingCents = outstanding.reduce((s, i) => s + Math.max(0, i.totalCents - (i.amountPaidCents - i.amountRefundedCents)), 0);
  const overdue = outstanding.filter((i) => i.dueAt && i.dueAt < now).length;
  const mrr = activeMemberships.reduce((s, m) => s + (m.plan.interval === "YEAR" ? Math.round(m.priceCents / 12) : m.priceCents), 0);
  const integrations = integrationStatus();

  return (
    <div>
      <PageHeader
        title={`Good ${zonedHourGreeting(now, tz)}, ${user.name.split(" ")[0]}`}
        description={formatDate(now, tz)}
        actions={
          <>
            <ButtonLink href="/admin/calendar" variant="outline">
              Calendar
            </ButtonLink>
            <ButtonLink href="/admin/appointments/new">New appointment</ButtonLink>
          </>
        }
      />

      {(!integrations.email || !integrations.stripe || integrations.maps === "none") && can(user.role, "settings:manage") && (
        <div className="mb-6">
          <Notice tone="warn" title="Some integrations are not configured yet">
            {[!integrations.email && "Email delivery (Resend)", !integrations.stripe && "Online card payments (Stripe)", integrations.maps === "none" && "Maps and drive-time estimates"].filter(Boolean).join(", ")}{" "}
            are not active. The app works without them; see <Link href="/admin/settings">Settings</Link> for setup details.
          </Notice>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Today's appointments" value={today.length} href="/admin/calendar?view=day" />
        <Stat label="Pending requests" value={pending.length} hint={pending.length ? "Need review" : "All caught up"} href="/admin/appointments?view=requests" />
        {showBilling && <Stat label="Revenue this month" value={formatCents(revenue)} hint="Verified payments, net of refunds" href="/admin/reports" />}
        {showBilling && <Stat label="Outstanding invoices" value={formatCents(outstandingCents)} hint={`${outstanding.length} open${overdue ? `, ${overdue} overdue` : ""}`} href="/admin/invoices?status=OPEN" />}
        {showBilling && <Stat label="Active memberships" value={activeMemberships.length} hint={`${formatCents(mrr)} monthly recurring`} href="/admin/memberships" />}
        <Stat label="New residential messages" value={newMessages} hint="Contact form" href="/admin/leads#residential" />
        <Stat label="New community leads" value={newInquiries + newCommunityMessages} hint={`${newInquiries} proposal request${newInquiries === 1 ? "" : "s"}`} href="/admin/leads#community" />
        <Stat label="Invoice requests" value={invoiceRequests} hint="From technicians" href="/admin/work-orders?filter=invoice" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <h2 className="mb-3 text-xl">Today</h2>
          {today.length === 0 ? (
            <EmptyState title="No appointments today" />
          ) : (
            <ul className="divide-y divide-line">
              {today.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <Link href={`/admin/appointments/${a.id}`} className="font-semibold">
                      {formatTime(a.startsAt, tz)} · {a.customer.firstName} {a.customer.lastName}
                    </Link>
                    <p className="text-sm">
                      {a.service.name} · {a.isRemote ? "Remote" : (a.address?.city ?? "")} · {a.technician?.displayName ?? "Unassigned"}
                    </p>
                  </div>
                  <AppointmentStatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
          <h2 className="mt-6 mb-3 text-xl">Upcoming (next 7 days)</h2>
          {upcoming.length === 0 ? (
            <p>Nothing scheduled.</p>
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <Link href={`/admin/appointments/${a.id}`}>
                    {formatDateTime(a.startsAt, tz)} · {a.customer.firstName} {a.customer.lastName} · {a.service.name}
                  </Link>
                  <AppointmentStatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 text-xl">Booking requests</h2>
            {pending.length === 0 ? (
              <p>No requests waiting.</p>
            ) : (
              <ul className="space-y-2">
                {pending.map((a) => (
                  <li key={a.id}>
                    <Link href={`/admin/appointments/${a.id}`} className="font-semibold">
                      {a.customer.firstName} {a.customer.lastName}
                    </Link>
                    <span className="block text-sm">
                      {a.service.name} · {formatDateTime(a.startsAt, tz)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="mb-3 text-xl">Upcoming facility visits</h2>
            {helpDays.length === 0 ? (
              <p>
                No Tech Help Days scheduled. <Link href="/admin/help-days">Schedule one</Link>
              </p>
            ) : (
              <ul className="space-y-2">
                {helpDays.map((h) => (
                  <li key={h.id}>
                    <Link href={`/admin/help-days/${h.id}`} className="font-semibold">
                      {h.facility.name}
                    </Link>
                    <span className="block text-sm">
                      {formatDateTime(h.startsAt, tz)} · {h._count.appointments} resident{h._count.appointments === 1 ? "" : "s"} booked
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="mb-3 text-xl">Recent customers</h2>
            <ul className="space-y-1">
              {recentCustomers.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/customers/${c.id}`}>
                    {c.firstName} {c.lastName}
                  </Link>
                  <span className="text-sm"> · {formatDate(c.createdAt, tz, { weekday: undefined, year: undefined, month: "short" })}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function zonedHourGreeting(d: Date, tz: string) {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(d));
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
