import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { ButtonLink, EmptyState, PageHeader, Table, Td, Th, Badge } from "@/components/ui";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("customers:view", "/admin/customers");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const where: Prisma.CustomerWhereInput = q
    ? {
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
          { addresses: { some: { OR: [{ line1: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }] } } },
          { familyContacts: { some: { name: { contains: q, mode: "insensitive" } } } },
        ],
      }
    : {};
  if (sp.status === "LEAD" || sp.status === "ACTIVE" || sp.status === "INACTIVE") where.status = sp.status;
  if (sp.members === "1") where.memberships = { some: { status: "ACTIVE" } };
  const customers = await prisma.customer.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    include: {
      addresses: { where: { isPrimary: true }, take: 1 },
      memberships: { where: { status: "ACTIVE" }, take: 1 },
      facility: true,
      _count: { select: { appointments: true } },
    },
  });
  return (
    <div>
      <PageHeader title="Customers" actions={<ButtonLink href="/admin/customers/new">Add customer</ButtonLink>} />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <label htmlFor="q" className="block text-sm font-semibold text-navy">
            Search name, email, phone, address, or family contact
          </label>
          <input id="q" name="q" defaultValue={q} className="w-full rounded-md border-2 border-line px-3 py-2" />
        </div>
        <div>
          <label htmlFor="status" className="block text-sm font-semibold text-navy">
            Status
          </label>
          <select id="status" name="status" defaultValue={sp.status ?? ""} className="rounded-md border-2 border-line px-3 py-2">
            <option value="">Any</option>
            <option value="ACTIVE">Active</option>
            <option value="LEAD">Lead</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2">
          <input type="checkbox" name="members" value="1" defaultChecked={sp.members === "1"} className="h-5 w-5" /> Members only
        </label>
        <button className="rounded-md bg-navy px-4 py-2 font-semibold text-white">Search</button>
      </form>
      {customers.length === 0 ? (
        <EmptyState title="No customers found">{q ? "Try a different search." : "Customers are created automatically when someone books online, or add one manually."}</EmptyState>
      ) : (
        <Table caption="Customers">
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Contact</Th>
              <Th>Location</Th>
              <Th>Visits</Th>
              <Th>Tags</Th>
              <Th>Added</Th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-soft">
                <Td>
                  <Link href={`/admin/customers/${c.id}`} className="font-semibold">
                    {c.lastName}, {c.firstName}
                  </Link>
                  {c.preferredName && <span className="block text-sm">Goes by {c.preferredName}</span>}
                </Td>
                <Td>
                  {c.phone && <span className="block">{c.phone}</span>}
                  {c.email && <span className="block text-sm">{c.email}</span>}
                </Td>
                <Td>{c.facility ? c.facility.name : (c.addresses[0]?.city ?? "—")}</Td>
                <Td>{c._count.appointments}</Td>
                <Td>
                  <span className="flex flex-wrap gap-1">
                    {c.memberships.length > 0 && <Badge tone="green">Member</Badge>}
                    {c.status !== "ACTIVE" && <Badge>{c.status.toLowerCase()}</Badge>}
                    {c.marketingOptIn && <Badge tone="navy">Marketing OK</Badge>}
                  </span>
                </Td>
                <Td>{formatDate(c.createdAt, undefined, { weekday: undefined, month: "short" })}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
