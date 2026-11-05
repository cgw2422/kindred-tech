import type { SessionUser } from "@/lib/auth/session";
import { listInvoicesForUser } from "@/lib/payments/portal";
import { portalPayInvoiceAction } from "@/lib/payments/portal-actions";
import { isStripeConfigured, NOT_CONFIGURED_LABEL } from "@/lib/payments/stripe";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { getSettings } from "@/lib/settings";
import { EmptyState, Notice } from "@/components/ui";
import { InvoiceStatusBadge } from "@/components/status";
import { SubmitButton } from "@/components/forms";

/**
 * Portal invoice list (server component). Shows invoices the signed-in user
 * may see — their own, or ones billed to them as an authorized family payer.
 * `returnPath` must be a /portal path; Stripe returns there after checkout.
 */
export async function InvoiceList({ user, returnPath = "/portal", billingError, paidInvoiceId }: { user: SessionUser; returnPath?: string; billingError?: string | null; paidInvoiceId?: string | null }) {
  const [invoices, biz] = await Promise.all([listInvoicesForUser(user), getSettings("business")]);
  const stripeOn = isStripeConfigured();
  const contact = [biz.phone, biz.email].filter(Boolean).join(" or ");
  return (
    <section aria-labelledby="billing-invoices">
      <h2 id="billing-invoices" className="mb-3 text-xl">
        Invoices
      </h2>
      <div className="mb-4 space-y-3">
        {billingError && <Notice tone="danger">{billingError}</Notice>}
        {paidInvoiceId && <Notice tone="green">Thank you. We are confirming your payment with the card processor; this page will show it as paid shortly.</Notice>}
      </div>
      {invoices.length === 0 ? (
        <EmptyState title="No invoices yet">When we bill you for a visit, it will appear here.</EmptyState>
      ) : (
        <ul className="space-y-4">
          {invoices.map((inv) => (
            <li key={inv.id} className="rounded-lg border border-line bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-heading text-lg text-navy">Invoice {inv.number}</p>
                  <p className="text-sm text-body">
                    {inv.issuedAt ? `Issued ${formatDate(inv.issuedAt, biz.timeZone)}` : ""}
                    {inv.dueAt && inv.balanceCents > 0 ? ` · Due ${formatDate(inv.dueAt, biz.timeZone)}` : ""}
                    {inv.forName ? ` · For ${inv.forName}` : ""}
                  </p>
                </div>
                <InvoiceStatusBadge status={inv.status} />
              </div>
              <ul className="mt-3 space-y-1 text-[0.95rem]">
                {inv.lines.map((l, i) => (
                  <li key={i} className="flex justify-between gap-4">
                    <span>
                      {l.description}
                      {l.quantity > 1 ? ` × ${l.quantity}` : ""}
                    </span>
                    <span className="whitespace-nowrap">{formatCents(l.amountCents)}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-3 grid grid-cols-2 gap-1 border-t border-line pt-3 text-[0.95rem] sm:max-w-xs sm:ml-auto">
                <dt>Total</dt>
                <dd className="text-right font-semibold">{formatCents(inv.totalCents)}</dd>
                {inv.amountPaidCents > 0 && (
                  <>
                    <dt>Paid</dt>
                    <dd className="text-right">{formatCents(inv.amountPaidCents - inv.amountRefundedCents)}</dd>
                  </>
                )}
                <dt className="font-bold text-navy">Balance</dt>
                <dd className="text-right font-bold text-navy">{formatCents(inv.balanceCents)}</dd>
              </dl>
              {inv.balanceCents > 0 && (
                <div className="mt-4">
                  {stripeOn ? (
                    <form action={portalPayInvoiceAction} className="flex flex-wrap gap-2">
                      <input type="hidden" name="invoiceId" value={inv.id} />
                      <input type="hidden" name="returnPath" value={returnPath} />
                      <SubmitButton pendingText="Opening secure checkout...">Pay {formatCents(inv.balanceCents)} securely by card</SubmitButton>
                      {inv.depositCents > 0 && inv.amountPaidCents === 0 && inv.depositCents < inv.balanceCents && (
                        <SubmitButton name="deposit" value="1" variant="outline" pendingText="Opening secure checkout...">
                          Pay {formatCents(inv.depositCents)} deposit
                        </SubmitButton>
                      )}
                    </form>
                  ) : (
                    <p className="text-sm text-body">
                      <strong>{NOT_CONFIGURED_LABEL}.</strong> To pay by check or cash, please contact us{contact ? ` at ${contact}` : ""}.
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
