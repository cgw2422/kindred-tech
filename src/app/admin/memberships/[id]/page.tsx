import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/time";
import { getSettings } from "@/lib/settings";
import { remoteMinutesUsage } from "@/lib/memberships/service";
import { benefitsList, membershipYearContaining } from "@/lib/memberships/calc";
import { isStripeConfigured } from "@/lib/payments/stripe";
import { Card, DefinitionList, Notice, PageHeader, SectionTitle, Table, Td, Th } from "@/components/ui";
import { MembershipStatusBadge, PaymentStatusBadge, humanize } from "@/components/status";
import { ActivateForm, CancelForm, CheckoutLinkForm, StateButton, UsageForm } from "../_components/MembershipForms";

export const metadata: Metadata = { title: "Membership" };

const SHORT: Intl.DateTimeFormatOptions = { weekday: undefined, month: "short" };

export default async function MembershipDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  await requirePermission("memberships:manage", `/admin/memberships/${id}`);
  const sp = await searchParams;
  const m = await prisma.membership.findUnique({
    where: { id },
    include: {
      plan: true,
      customer: true,
      purchaserContact: true,
      usage: { orderBy: { createdAt: "desc" }, take: 100 },
      payments: { orderBy: { receivedAt: "desc" }, take: 50 },
    },
  });
  if (!m) notFound();
  const [biz, notes] = await Promise.all([
    getSettings("business"),
    prisma.communication.findMany({ where: { relatedType: "Membership", relatedId: m.id, channel: "NOTE" }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const tz = biz.timeZone;
  const stripeOn = isStripeConfigured();
  const usage = await remoteMinutesUsage(m);
  const anchor = m.startedAt ?? m.currentPeriodStart;
  const year = anchor ? membershipYearContaining(anchor, new Date()) : null;
  const reviewUsed = year ? m.usage.some((u) => u.type === "ANNUAL_REVIEW" && u.createdAt >= year.start && u.createdAt < year.end) : false;
  const usageOptions = [
    ...(m.plan.remoteMinutesPerPeriod > 0 ? [{ value: "REMOTE_MINUTES", label: `Remote support minutes (${usage.remaining} left)` }] : []),
    ...(m.plan.annualReviewIncluded && !reviewUsed ? [{ value: "ANNUAL_REVIEW", label: "Annual technology review" }] : []),
    ...(m.plan.inHomeDiscountPercent > 0 ? [{ value: "IN_HOME_DISCOUNT", label: `In-home visit discount (${m.plan.inHomeDiscountPercent}%)` }] : []),
    ...(m.plan.priorityScheduling ? [{ value: "PRIORITY_BOOKING", label: "Priority booking" }] : []),
  ];
  const isOpen = m.status !== "CANCELED";

  return (
    <>
      <PageHeader
        eyebrow="Membership"
        title={`${m.customer.firstName} ${m.customer.lastName}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {m.plan.name} · {formatCents(m.priceCents)}/{m.plan.interval === "YEAR" ? "year" : "month"} <MembershipStatusBadge status={m.status} />
          </span>
        }
        actions={<Link href="/admin/memberships">All memberships</Link>}
      />
      <div className="mb-4 space-y-3">
        {sp.status === "success" && <Notice tone="green">Stripe Checkout completed. The membership activates once Stripe confirms payment by webhook.</Notice>}
        {sp.status === "canceled" && <Notice tone="warn">Stripe Checkout was canceled.</Notice>}
        {m.status === "PAST_DUE" && <Notice tone="danger" title="Payment past due">The last renewal payment failed ({m.failedPaymentCount} attempt{m.failedPaymentCount === 1 ? "" : "s"}{m.lastPaymentFailedAt ? `, most recently ${formatDate(m.lastPaymentFailedAt, tz, SHORT)}` : ""}). The customer was emailed a link to update their card.</Notice>}
        {m.cancelAtPeriodEnd && isOpen && <Notice tone="warn">Scheduled to cancel {m.currentPeriodEnd ? `on ${formatDate(m.currentPeriodEnd, tz)}` : "at the end of the period"}.</Notice>}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <DefinitionList
              items={[
                ["Member", <Link key="c" href={`/admin/customers/${m.customer.id}`}>{m.customer.firstName} {m.customer.lastName}</Link>],
                ["Paid by", m.purchaserContact ? `${m.purchaserContact.name}${m.purchaserContact.relationship ? ` (${m.purchaserContact.relationship})` : ""}${m.purchaserContact.email ? ` · ${m.purchaserContact.email}` : ""}` : "The member"],
                ["Billing", m.stripeSubscriptionId ? `Stripe subscription (${m.stripeSubscriptionId})` : "Offline / manual (cash or check)"],
                ["Started", m.startedAt ? formatDate(m.startedAt, tz) : "Not started"],
                ["Current period", m.currentPeriodStart && m.currentPeriodEnd ? `${formatDate(m.currentPeriodStart, tz, SHORT)} – ${formatDate(m.currentPeriodEnd, tz, SHORT)}` : "—"],
                ["Remote minutes", m.plan.remoteMinutesPerPeriod > 0 ? `${usage.used} used, ${usage.remaining} of ${usage.allowance} left this period` : "Not included"],
                ["Annual review", m.plan.annualReviewIncluded ? (reviewUsed ? "Used this membership year" : "Available") : "Not included"],
                ["Canceled", m.canceledAt ? `${formatDate(m.canceledAt, tz)}${m.cancelReason ? ` — ${m.cancelReason}` : ""}` : "—"],
              ]}
            />
            <p className="mt-4 font-semibold text-navy">Benefits</p>
            <ul className="list-disc pl-6">
              {benefitsList(m.plan).map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </Card>

          <section aria-labelledby="usage-h">
            <SectionTitle id="usage-h">Usage history</SectionTitle>
            {m.usage.length === 0 ? (
              <p className="text-body">No benefits used yet.</p>
            ) : (
              <Table caption="Usage history">
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Benefit</Th>
                    <Th>Amount</Th>
                    <Th>Note</Th>
                  </tr>
                </thead>
                <tbody>
                  {m.usage.map((u) => (
                    <tr key={u.id}>
                      <Td>{formatDateTime(u.createdAt, tz)}</Td>
                      <Td>{humanize(u.type)}</Td>
                      <Td>{u.type === "REMOTE_MINUTES" ? `${u.quantity} min` : u.valueCents ? `${formatCents(u.valueCents)} discount` : "—"}</Td>
                      <Td>{u.notes ?? ""}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </section>

          <section aria-labelledby="pay-h">
            <SectionTitle id="pay-h">Payments</SectionTitle>
            {m.payments.length === 0 ? (
              <p className="text-body">{m.stripeSubscriptionId ? "No payments confirmed by Stripe yet." : "Offline memberships are paid through invoices; record those payments on the invoice."}</p>
            ) : (
              <Table caption="Membership payments">
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {m.payments.map((p) => (
                    <tr key={p.id}>
                      <Td>{formatDateTime(p.receivedAt, tz)}</Td>
                      <Td>
                        <PaymentStatusBadge status={p.status} />
                        {p.failureReason && <span className="block text-sm text-danger">{p.failureReason}</span>}
                      </Td>
                      <Td className="text-right">{formatCents(p.amountCents)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </section>

          {notes.length > 0 && (
            <section aria-labelledby="notes-h">
              <SectionTitle id="notes-h">Staff notes</SectionTitle>
              <ul className="space-y-2">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-md border border-line bg-white p-3">
                    <p className="font-semibold text-navy">{n.subject}</p>
                    <p className="text-sm text-body">{formatDateTime(n.createdAt, tz)}</p>
                    {n.bodyPreview && <p className="whitespace-pre-line">{n.bodyPreview}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4" aria-label="Membership actions">
          {m.status === "PENDING" && (
            <>
              <Card>
                <h2 className="mb-2 text-lg">Collect payment online</h2>
                {stripeOn ? (
                  <>
                    <p className="mb-3 text-sm">Creates a Stripe subscription checkout{m.purchaserContact ? ` for ${m.purchaserContact.name} to complete` : ""}. The membership activates automatically when Stripe confirms the first payment.</p>
                    <CheckoutLinkForm membershipId={m.id} />
                  </>
                ) : (
                  <Notice tone="warn">Online card payment is not configured. Activate manually for cash or check billing.</Notice>
                )}
              </Card>
              <Card>
                <h2 className="mb-2 text-lg">Activate manually</h2>
                <p className="mb-3 text-sm">For members paying by cash or check. Starts the first {m.plan.interval === "YEAR" ? "year" : "month"} today.</p>
                <ActivateForm membershipId={m.id} />
              </Card>
            </>
          )}
          {m.status === "ACTIVE" && usageOptions.length > 0 && (
            <Card>
              <h2 className="mb-2 text-lg">Record usage</h2>
              <UsageForm membershipId={m.id} options={usageOptions} remaining={usage.remaining} />
            </Card>
          )}
          {isOpen && m.status !== "PENDING" && (
            <Card>
              <h2 className="mb-2 text-lg">Status</h2>
              <div className="space-y-3">
                {m.status === "ACTIVE" && <StateButton membershipId={m.id} op="pause" label="Pause membership" confirm="Pause this membership? Benefits cannot be used while paused." />}
                {m.status === "PAUSED" && <StateButton membershipId={m.id} op="resume" label="Resume membership" variant="secondary" />}
                {m.cancelAtPeriodEnd && <StateButton membershipId={m.id} op="keep" label="Keep membership (undo scheduled cancel)" />}
                {!m.stripeSubscriptionId && ["ACTIVE", "PAST_DUE"].includes(m.status) && (
                  <StateButton membershipId={m.id} op="renew" label="Renew for next period (payment received)" confirm="Advance this offline membership to its next billing period?" />
                )}
              </div>
            </Card>
          )}
          {isOpen && (
            <Card>
              <h2 className="mb-2 text-lg">Cancel</h2>
              {m.stripeSubscriptionId && !stripeOn && m.status !== "PENDING" ? (
                <Notice tone="warn">This membership is billed by Stripe, which is not configured here. Cancel it in the Stripe dashboard.</Notice>
              ) : (
                <CancelForm membershipId={m.id} allowPeriodEnd={m.status !== "PENDING" && !m.cancelAtPeriodEnd} />
              )}
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
