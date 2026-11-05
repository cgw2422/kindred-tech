import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { AppointmentStatusBadge, InvoiceStatusBadge } from "@/components/status";
import { formatDateTime } from "@/lib/time";
import { formatCents } from "@/lib/money";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePermission("dashboard:view", "/admin/search");
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  const biz = await getSettings("business");
  if (q.length < 2) {
    return (
      <div>
        <PageHeader title="Search" />
        <EmptyState title="Type at least two characters to search" />
      </div>
    );
  }
  const ci = { contains: q, mode: "insensitive" as const };
  const [customers, appointments, invoices, facilities] = await Promise.all([
    can(user.role, "customers:view")
      ? prisma.customer.findMany({
          where: { OR: [{ firstName: ci }, { lastName: ci }, { email: ci }, { phone: { contains: q } }, { addresses: { some: { OR: [{ line1: ci }, { city: ci }] } } }, { familyContacts: { some: { OR: [{ name: ci }, { email: ci }] } } }] },
          take: 20,
          include: { addresses: { where: { isPrimary: true }, take: 1 } },
        })
      : [],
    can(user.role, "appointments:view")
      ? prisma.appointment.findMany({
          where: { OR: [{ reference: { equals: q.toUpperCase() } }, { customer: { OR: [{ firstName: ci }, { lastName: ci }] } }, { problemDescription: ci }] },
          take: 20,
          orderBy: { startsAt: "desc" },
          include: { customer: true, service: true },
        })
      : [],
    can(user.role, "billing:view")
      ? prisma.invoice.findMany({ where: { OR: [{ number: ci }, { customer: { OR: [{ firstName: ci }, { lastName: ci }] } }, { facility: { name: ci } }] }, take: 20, include: { customer: true, facility: true } })
      : [],
    can(user.role, "facilities:view") ? prisma.facility.findMany({ where: { OR: [{ name: ci }, { city: ci }, { contacts: { some: { name: ci } } }] }, take: 20 }) : [],
  ]);
  const total = customers.length + appointments.length + invoices.length + facilities.length;
  return (
    <div>
      <PageHeader title={`Search results for "${q}"`} description={`${total} result${total === 1 ? "" : "s"}`} />
      {total === 0 && <EmptyState title="Nothing found">Try a name, phone number, email, appointment reference, or invoice number.</EmptyState>}
      <div className="grid gap-6 lg:grid-cols-2">
        {customers.length > 0 && (
          <Card>
            <h2 className="mb-3 text-xl">Customers</h2>
            <ul className="space-y-2">
              {customers.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/customers/${c.id}`} className="font-semibold">
                    {c.firstName} {c.lastName}
                  </Link>
                  <span className="block text-sm">{[c.phone, c.email, c.addresses[0]?.city].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {appointments.length > 0 && (
          <Card>
            <h2 className="mb-3 text-xl">Appointments</h2>
            <ul className="space-y-2">
              {appointments.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/appointments/${a.id}`} className="font-semibold">
                    {a.reference}
                  </Link>
                  {formatDateTime(a.startsAt, biz.timeZone)} · {a.customer.firstName} {a.customer.lastName} · {a.service.name} <AppointmentStatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          </Card>
        )}
        {invoices.length > 0 && (
          <Card>
            <h2 className="mb-3 text-xl">Invoices</h2>
            <ul className="space-y-2">
              {invoices.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/invoices/${i.id}`} className="font-semibold">
                    {i.number}
                  </Link>
                  {i.customer ? `${i.customer.firstName} ${i.customer.lastName}` : i.facility?.name} · {formatCents(i.totalCents)} <InvoiceStatusBadge status={i.status} />
                </li>
              ))}
            </ul>
          </Card>
        )}
        {facilities.length > 0 && (
          <Card>
            <h2 className="mb-3 text-xl">Senior living communities</h2>
            <ul className="space-y-2">
              {facilities.map((f) => (
                <li key={f.id}>
                  <Link href={`/admin/facilities/${f.id}`} className="font-semibold">
                    {f.name}
                  </Link>
                  <span className="text-sm"> · {f.city}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
