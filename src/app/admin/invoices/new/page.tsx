import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { NewInvoiceForm } from "../_components/InvoiceForms";

export const metadata: Metadata = { title: "New Invoice" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("billing:manage", "/admin/invoices/new");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);

  const customer = sp.customerId
    ? await prisma.customer.findUnique({ where: { id: sp.customerId }, include: { familyContacts: { where: { canPay: true }, orderBy: { name: "asc" } } } })
    : null;
  const facility = !customer && sp.facilityId ? await prisma.facility.findUnique({ where: { id: sp.facilityId } }) : null;

  if (customer || facility) {
    const services = await prisma.service.findMany({ where: { isActive: true }, select: { id: true, name: true, basePriceCents: true }, orderBy: { name: "asc" } }).catch(() => []);
    return (
      <>
        <PageHeader
          title="New invoice"
          eyebrow="Billing"
          description={
            <>
              For <strong>{customer ? `${customer.firstName} ${customer.lastName}` : facility!.name}</strong>
              {customer ? " (customer)" : " (senior living facility)"}. <Link href="/admin/invoices/new">Change</Link>
            </>
          }
        />
        <Card className="max-w-3xl">
          <NewInvoiceForm
            customerId={customer?.id}
            facilityId={facility?.id}
            contacts={customer?.familyContacts.map((c) => ({ id: c.id, name: c.name, relationship: c.relationship })) ?? []}
            services={services}
          />
        </Card>
      </>
    );
  }

  const parts = q.split(/\s+/).filter(Boolean);
  const customers = q
    ? await prisma.customer.findMany({
        where: {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            ...(parts.length === 2 ? [{ firstName: { contains: parts[0], mode: "insensitive" as const }, lastName: { contains: parts[1], mode: "insensitive" as const } }] : []),
          ],
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        take: 25,
      })
    : [];
  const facilities = await prisma.facility.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 });

  return (
    <>
      <PageHeader title="New invoice" eyebrow="Billing" description="Choose who this invoice is for." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-xl">A customer</h2>
          <form method="get" role="search" className="mb-4 flex gap-2">
            <label htmlFor="cust-q" className="sr-only">
              Search customers
            </label>
            <input id="cust-q" name="q" defaultValue={q} placeholder="Name, email, or phone" className="w-full rounded-md border-2 border-line px-3 py-2" />
            <button type="submit" className="rounded-md bg-navy px-4 py-2 font-semibold text-white">
              Search
            </button>
          </form>
          {q && customers.length === 0 && <EmptyState title="No customers match">Check the spelling or search by phone.</EmptyState>}
          <ul className="divide-y divide-line">
            {customers.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <strong>
                    {c.firstName} {c.lastName}
                  </strong>
                  <span className="block text-sm text-body">{[c.email, c.phone].filter(Boolean).join(" · ")}</span>
                </span>
                <Link href={`/admin/invoices/new?customerId=${c.id}`} className="font-semibold">
                  Select
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 text-xl">A senior living facility</h2>
          {facilities.length === 0 ? (
            <p>No facilities yet.</p>
          ) : (
            <form method="get" className="flex gap-2">
              <label htmlFor="facilityId" className="sr-only">
                Facility
              </label>
              <select id="facilityId" name="facilityId" className="w-full rounded-md border-2 border-line px-3 py-2" required>
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="rounded-md bg-navy px-4 py-2 font-semibold text-white">
                Continue
              </button>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
