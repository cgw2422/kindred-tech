import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import { CreateMembershipForm } from "../_components/MembershipForms";

export const metadata: Metadata = { title: "New Membership" };

export default async function NewMembershipPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("memberships:manage", "/admin/memberships/new");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const customer = sp.customerId
    ? await prisma.customer.findUnique({ where: { id: sp.customerId }, include: { familyContacts: { where: { canPay: true }, orderBy: { name: "asc" } }, memberships: { where: { status: { not: "CANCELED" } }, include: { plan: true } } } })
    : null;

  if (customer) {
    const plans = await prisma.membershipPlan.findMany({ where: { isActive: true }, orderBy: { priceCents: "asc" } });
    const existing = customer.memberships[0];
    return (
      <>
        <PageHeader
          eyebrow="Memberships"
          title="New membership"
          description={
            <>
              For <strong>{customer.firstName} {customer.lastName}</strong>. <Link href="/admin/memberships/new">Change</Link>
            </>
          }
        />
        <Card className="max-w-2xl">
          {existing ? (
            <Notice tone="warn">
              This customer already has a {existing.status.toLowerCase().replace("_", " ")} {existing.plan.name} membership. <Link href={`/admin/memberships/${existing.id}`}>View it</Link>.
            </Notice>
          ) : plans.length === 0 ? (
            <Notice tone="warn">
              There are no active plans. <Link href="/admin/memberships/plans">Create a plan</Link> first.
            </Notice>
          ) : (
            <CreateMembershipForm
              customerId={customer.id}
              plans={plans.map((p) => ({ id: p.id, label: `${p.name} — ${formatCents(p.priceCents)}/${p.interval === "YEAR" ? "year" : "month"}` }))}
              contacts={customer.familyContacts.map((c) => ({ id: c.id, label: `${c.name}${c.relationship ? ` (${c.relationship})` : ""}${c.email ? "" : " — no email"}` }))}
            />
          )}
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
  return (
    <>
      <PageHeader eyebrow="Memberships" title="New membership" description="Find the customer who will receive the membership benefits. A family member can pay for it on the next step." />
      <Card className="max-w-2xl">
        <form method="get" role="search" className="mb-4 flex gap-2">
          <label htmlFor="cust-q" className="sr-only">
            Search customers
          </label>
          <input id="cust-q" name="q" defaultValue={q} placeholder="Name, email, or phone" className="w-full rounded-md border-2 border-line px-3 py-2" />
          <button type="submit" className="rounded-md bg-navy px-4 py-2 font-semibold text-white">
            Search
          </button>
        </form>
        {q && customers.length === 0 && <EmptyState title="No customers match" />}
        <ul className="divide-y divide-line">
          {customers.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                <strong>
                  {c.firstName} {c.lastName}
                </strong>
                <span className="block text-sm text-body">{[c.email, c.phone].filter(Boolean).join(" · ")}</span>
              </span>
              <Link href={`/admin/memberships/new?customerId=${c.id}`} className="font-semibold">
                Select
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
