import type { SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getActiveMembershipForCustomer } from "@/lib/memberships/service";
import { benefitsList } from "@/lib/memberships/calc";
import { membershipPurchaseTargets } from "@/lib/payments/portal";
import { portalOpenBillingPortalAction, portalStartMembershipCheckoutAction } from "@/lib/payments/portal-actions";
import { isStripeConfigured } from "@/lib/payments/stripe";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { getSettings } from "@/lib/settings";
import { Card, Notice } from "@/components/ui";
import { MembershipStatusBadge } from "@/components/status";
import { SubmitButton } from "@/components/forms";

/**
 * Portal membership summary (server component) for the signed-in customer:
 * current Kindred Care plan, remaining remote minutes, and billing actions —
 * or the available plans with a "Join" button when there is no membership.
 */
export async function MembershipSummary({ user, returnPath = "/portal", billingError }: { user: SessionUser; returnPath?: string; billingError?: string | null }) {
  const stripeOn = isStripeConfigured();
  const biz = await getSettings("business");
  const contact = [biz.phone, biz.email].filter(Boolean).join(" or ");
  const current = user.customerId ? await getActiveMembershipForCustomer(user.customerId) : null;
  const other = user.customerId && !current ? await prisma.membership.findFirst({ where: { customerId: user.customerId, status: { in: ["PENDING", "PAUSED"] } }, include: { plan: true } }) : null;
  const customer = user.customerId ? await prisma.customer.findUnique({ where: { id: user.customerId }, select: { stripeCustomerId: true } }) : null;

  if (current) {
    const { membership: m, plan } = current;
    return (
      <Card as="section">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl">{plan.name}</h2>
          <MembershipStatusBadge status={m.status} />
        </div>
        {billingError && <div className="mb-3"><Notice tone="danger">{billingError}</Notice></div>}
        {m.status === "PAST_DUE" && (
          <div className="mb-3">
            <Notice tone="danger" title="Payment problem">We could not process your last membership payment. Please update your payment details{stripeOn && customer?.stripeCustomerId ? " below" : ` or contact us${contact ? ` at ${contact}` : ""}`}.</Notice>
          </div>
        )}
        {m.cancelAtPeriodEnd && m.currentPeriodEnd && (
          <div className="mb-3">
            <Notice tone="warn">Your membership will end on {formatDate(m.currentPeriodEnd, biz.timeZone)}.</Notice>
          </div>
        )}
        <p className="mb-2">
          {formatCents(m.priceCents)} per {plan.interval === "YEAR" ? "year" : "month"}
          {m.currentPeriodEnd && !m.cancelAtPeriodEnd ? ` · Renews ${formatDate(m.currentPeriodEnd, biz.timeZone)}` : ""}
        </p>
        {plan.remoteMinutesPerPeriod > 0 && (
          <p className="mb-2">
            <strong>{current.remoteMinutesRemaining}</strong> of {plan.remoteMinutesPerPeriod} remote support minutes left this {plan.interval === "YEAR" ? "year" : "month"}.
          </p>
        )}
        <ul className="mb-4 list-disc pl-6">
          {benefitsList(plan).map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        {stripeOn && customer?.stripeCustomerId ? (
          <form action={portalOpenBillingPortalAction}>
            <input type="hidden" name="returnPath" value={returnPath} />
            <SubmitButton variant="outline" pendingText="Opening...">
              Manage payment details
            </SubmitButton>
          </form>
        ) : (
          <p className="text-sm text-body">To change or cancel your membership, please contact us{contact ? ` at ${contact}` : ""}.</p>
        )}
      </Card>
    );
  }

  const plans = await prisma.membershipPlan.findMany({ where: { isActive: true }, orderBy: { priceCents: "asc" } });
  const targets = await membershipPurchaseTargets(user);
  return (
    <Card as="section">
      <h2 className="mb-2 text-xl">Kindred Care membership</h2>
      {billingError && <div className="mb-3"><Notice tone="danger">{billingError}</Notice></div>}
      {other?.status === "PAUSED" && <p className="mb-3">Your {other.plan.name} membership is paused. Contact us when you are ready to resume.</p>}
      {other?.status === "PENDING" && <p className="mb-3">Your {other.plan.name} membership is waiting for payment confirmation.</p>}
      {plans.length === 0 ? (
        <p>Membership plans are not available right now.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {plans.map((plan) => (
            <div key={plan.id} className="rounded-md border border-line p-4">
              <p className="font-heading text-lg text-navy">{plan.name}</p>
              <p className="mb-2 font-semibold">
                {formatCents(plan.priceCents)} / {plan.interval === "YEAR" ? "year" : "month"}
              </p>
              <ul className="mb-3 list-disc pl-6 text-[0.95rem]">
                {benefitsList(plan).map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              {stripeOn && targets.length > 0 && other?.status !== "PAUSED" ? (
                <form action={portalStartMembershipCheckoutAction}>
                  <input type="hidden" name="planId" value={plan.id} />
                  <input type="hidden" name="returnPath" value={returnPath} />
                  {targets.length > 1 ? (
                    <label className="mb-2 block text-sm font-semibold text-navy">
                      Membership for
                      <select name="customerId" className="mt-1 block w-full rounded-md border-2 border-line px-2 py-2">
                        {targets.map((t) => (
                          <option key={t.customerId} value={t.customerId}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <input type="hidden" name="customerId" value={targets[0].customerId} />
                  )}
                  <SubmitButton pendingText="Opening secure checkout...">Join {plan.name}</SubmitButton>
                </form>
              ) : (
                <p className="text-sm text-body">To join, please contact us{contact ? ` at ${contact}` : ""}.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
