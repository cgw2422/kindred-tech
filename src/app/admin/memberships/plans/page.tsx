import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { centsToDollarString, formatCents } from "@/lib/money";
import { benefitsList } from "@/lib/memberships/calc";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { PlanForm, type PlanFormValues } from "../_components/MembershipForms";

export const metadata: Metadata = { title: "Membership Plans" };

const BLANK: PlanFormValues = {
  name: "",
  slug: "",
  description: "",
  price: "",
  interval: "MONTH",
  stripePriceId: "",
  priorityScheduling: true,
  remoteMinutesPerPeriod: 0,
  annualReviewIncluded: false,
  inHomeDiscountPercent: 0,
  benefitsText: "",
  isActive: true,
};

export default async function PlansPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("memberships:manage", "/admin/memberships/plans");
  const sp = await searchParams;
  const plans = await prisma.membershipPlan.findMany({ orderBy: [{ isActive: "desc" }, { priceCents: "asc" }], include: { _count: { select: { memberships: { where: { status: { in: ["ACTIVE", "PAST_DUE", "PAUSED"] } } } } } } });
  const editing = sp.plan === "new" ? null : plans.find((p) => p.id === sp.plan);
  const showForm = sp.plan === "new" || Boolean(editing);
  const values: PlanFormValues = editing
    ? {
        id: editing.id,
        name: editing.name,
        slug: editing.slug,
        description: editing.description,
        price: centsToDollarString(editing.priceCents),
        interval: editing.interval,
        stripePriceId: editing.stripePriceId ?? "",
        priorityScheduling: editing.priorityScheduling,
        remoteMinutesPerPeriod: editing.remoteMinutesPerPeriod,
        annualReviewIncluded: editing.annualReviewIncluded,
        inHomeDiscountPercent: editing.inHomeDiscountPercent,
        benefitsText: editing.benefitsText.join("\n"),
        isActive: editing.isActive,
      }
    : BLANK;

  return (
    <>
      <PageHeader
        eyebrow="Memberships"
        title="Membership plans"
        description="Kindred Care plans include priority scheduling, remote support minutes, an annual review, and in-home visit discounts. Plans never include unlimited in-home visits."
        actions={
          <>
            <ButtonLink href="/admin/memberships" variant="outline">
              Memberships
            </ButtonLink>
            <ButtonLink href="/admin/memberships/plans?plan=new">New plan</ButtonLink>
          </>
        }
      />
      {plans.length === 0 ? (
        <EmptyState title="No plans yet">Create the first Kindred Care plan.</EmptyState>
      ) : (
        <Table caption="Membership plans">
          <thead>
            <tr>
              <Th>Plan</Th>
              <Th>Price</Th>
              <Th>Benefits</Th>
              <Th>Members</Th>
              <Th>Stripe</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id}>
                <Td>
                  <strong>{p.name}</strong> {!p.isActive && <Badge>Inactive</Badge>}
                  <span className="block text-sm text-body">{p.slug}</span>
                </Td>
                <Td>
                  {formatCents(p.priceCents)}/{p.interval === "YEAR" ? "year" : "month"}
                </Td>
                <Td>
                  <ul className="list-disc pl-5 text-sm">
                    {benefitsList(p).map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </Td>
                <Td>{p._count.memberships}</Td>
                <Td className="text-sm">{p.stripePriceId ?? "Price created at checkout"}</Td>
                <Td>
                  <Link href={`/admin/memberships/plans?plan=${p.id}`}>Edit</Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {showForm && (
        <Card className="mt-6 max-w-3xl">
          <h2 className="mb-1 text-xl">{editing ? `Edit ${editing.name}` : "New plan"}</h2>
          {editing && <p className="mb-4 text-sm text-body">Price changes apply to new members. Existing members keep their price; Stripe subscriptions keep their Stripe price until changed in Stripe.</p>}
          <PlanForm key={editing?.id ?? "new"} plan={values} />
        </Card>
      )}
    </>
  );
}
