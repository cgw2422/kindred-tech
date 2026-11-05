import type { Metadata } from "next";
import Link from "next/link";
import type { MembershipStatus, Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { getSettings } from "@/lib/settings";
import { membershipMetrics } from "@/lib/memberships/service";
import { formatPercent } from "@/lib/memberships/calc";
import { isStripeConfigured } from "@/lib/payments/stripe";
import { ButtonLink, EmptyState, Notice, PageHeader, Stat, Table, Td, Th } from "@/components/ui";
import { MembershipStatusBadge } from "@/components/status";

const SHORT: Intl.DateTimeFormatOptions = { weekday: undefined, month: "short" };
export const metadata: Metadata = { title: "Memberships" };

const STATUSES: MembershipStatus[] = ["ACTIVE", "PENDING", "PAST_DUE", "PAUSED", "CANCELED"];

export default async function MembershipsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("memberships:manage", "/admin/memberships");
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as MembershipStatus) ? (sp.status as MembershipStatus) : undefined;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const biz = await getSettings("business");

  const where: Prisma.MembershipWhereInput = {};
  if (status) where.status = status;
  if (q) where.customer = { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] };

  const [rows, metrics] = await Promise.all([
    prisma.membership.findMany({
      where,
      include: { plan: true, customer: { select: { id: true, firstName: true, lastName: true } }, purchaserContact: { select: { name: true, relationship: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
    }),
    membershipMetrics({ timeZone: biz.timeZone }),
  ]);
  const monthLabel = formatDate(metrics.monthStart, biz.timeZone, { month: "long", year: "numeric", day: undefined, weekday: undefined });

  return (
    <>
      <PageHeader
        title="Memberships"
        description="Kindred Care memberships: priority scheduling, included remote support minutes, annual reviews, and in-home visit discounts."
        actions={
          <>
            <ButtonLink href="/admin/memberships/plans" variant="outline">
              Plans
            </ButtonLink>
            <ButtonLink href="/admin/memberships/new">New membership</ButtonLink>
          </>
        }
      />
      {!isStripeConfigured() && (
        <div className="mb-4">
          <Notice tone="warn">Online card payment is not configured. Memberships can be activated manually for customers paying by cash or check.</Notice>
        </div>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="MRR" value={formatCents(metrics.mrrCents)} hint="Active memberships, yearly plans ÷ 12" />
        <Stat label="Active" value={metrics.activeCount} href="/admin/memberships?status=ACTIVE" />
        <Stat label="Past due" value={metrics.pastDueCount} href="/admin/memberships?status=PAST_DUE" hint={metrics.pendingCount ? `${metrics.pendingCount} pending` : undefined} />
        <Stat label={`Churn (${monthLabel})`} value={formatPercent(metrics.churn.rate)} hint={`${metrics.churn.churned} of ${metrics.churn.activeAtStart} active at month start canceled`} />
      </div>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3" role="search">
        <label className="text-sm font-semibold text-navy">
          Customer
          <input name="q" defaultValue={q} placeholder="Name or email" className="mt-1 block w-60 rounded-md border-2 border-line px-3 py-2" />
        </label>
        <label className="text-sm font-semibold text-navy">
          Status
          <select name="status" defaultValue={status ?? ""} className="mt-1 block rounded-md border-2 border-line px-3 py-2">
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ").toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-md bg-navy px-4 py-2 font-semibold text-white">
          Filter
        </button>
        {(q || status) && <Link href="/admin/memberships">Clear</Link>}
      </form>
      {rows.length === 0 ? (
        <EmptyState title="No memberships found" />
      ) : (
        <Table caption="Memberships">
          <thead>
            <tr>
              <Th>Member</Th>
              <Th>Plan</Th>
              <Th>Status</Th>
              <Th>Billing</Th>
              <Th>Current period ends</Th>
              <Th className="text-right">Price</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <Td>
                  <Link href={`/admin/memberships/${m.id}`} className="font-semibold">
                    {m.customer.firstName} {m.customer.lastName}
                  </Link>
                  {m.purchaserContact && <span className="block text-sm text-body">Paid by {m.purchaserContact.name}{m.purchaserContact.relationship ? ` (${m.purchaserContact.relationship})` : ""}</span>}
                </Td>
                <Td>{m.plan.name}</Td>
                <Td>
                  <MembershipStatusBadge status={m.status} />
                  {m.cancelAtPeriodEnd && m.status !== "CANCELED" && <span className="block text-sm text-warn">Cancels at period end</span>}
                  {m.failedPaymentCount > 0 && <span className="block text-sm text-danger">{m.failedPaymentCount} failed payment(s)</span>}
                </Td>
                <Td>{m.stripeSubscriptionId ? "Stripe subscription" : "Offline / manual"}</Td>
                <Td>{m.currentPeriodEnd ? formatDate(m.currentPeriodEnd, biz.timeZone, SHORT) : "—"}</Td>
                <Td className="text-right">
                  {formatCents(m.priceCents)}/{m.plan.interval === "YEAR" ? "yr" : "mo"}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
