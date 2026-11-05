import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { Notice } from "@/components/ui";
import { InvoiceStatusBadge } from "@/components/status";
import { SubmitButton } from "@/components/forms";
import { findInvoiceByPayToken } from "@/lib/billing/invoices";
import { invoiceBalance } from "@/lib/pricing";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { getSettings } from "@/lib/settings";
import { isStripeConfigured, NOT_CONFIGURED_LABEL, payableAmount } from "@/lib/payments/stripe";
import { payInvoiceByTokenAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pay Invoice", robots: { index: false, follow: false, nocache: true } };

const ERRORS: Record<string, string> = {
  not_configured: "Online card payment is not available right now. Please contact us to pay by check or cash.",
  rate_limited: "Too many attempts. Please wait a few minutes and try again.",
  not_found: "We could not find that invoice. The link may have been replaced with a newer one.",
  not_payable: "This invoice cannot be paid online right now. Please contact us.",
  checkout_failed: "We could not start the secure checkout. Please try again in a moment, or contact us.",
};

export default async function PayInvoicePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await params;
  const sp = await searchParams;
  const [inv, biz] = await Promise.all([findInvoiceByPayToken(token), getSettings("business")]);
  const contact = [biz.phone, biz.email].filter(Boolean);

  const header = (
    <header className="border-b border-line bg-white print:border-0">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
        <Logo />
        {biz.phone && <a href={`tel:${biz.phone.replace(/[^\d+]/g, "")}`} className="font-semibold print:hidden">{biz.phone}</a>}
      </div>
    </header>
  );

  if (!inv) {
    if (!token) notFound();
    return (
      <div className="min-h-screen bg-soft">
        {header}
        <main className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="mb-3 text-2xl">Invoice link not found</h1>
          <p>This payment link is no longer valid. It may have been replaced with a newer link, or the invoice may have been voided.</p>
          {contact.length > 0 && <p className="mt-3">Please contact us at {contact.join(" or ")} and we will be glad to help.</p>}
        </main>
      </div>
    );
  }

  const balance = inv.status === "VOID" ? 0 : invoiceBalance(inv);
  const stripeOn = isStripeConfigured();
  const deposit = payableAmount(inv, { payDeposit: true });
  const canPayOnline = stripeOn && balance > 0 && ["OPEN", "PARTIALLY_PAID"].includes(inv.status);
  const paidNet = inv.amountPaidCents - inv.amountRefundedCents;
  const billTo = inv.billToContact?.name ?? (inv.customer ? `${inv.customer.firstName} ${inv.customer.lastName}` : inv.facility?.name ?? "");

  return (
    <div className="min-h-screen bg-soft">
      {header}
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 space-y-3 print:hidden">
          {sp.status === "success" &&
            (inv.status === "PAID" ? (
              <Notice tone="green" title="Paid in full">Thank you. Your payment has been received.</Notice>
            ) : (
              <Notice tone="green" title="Thank you — we are confirming your payment">
                Your card payment was submitted. It can take a minute for the card processor to confirm it; this page will show the invoice as paid once it does. You do not need to pay again.
              </Notice>
            ))}
          {sp.status === "canceled" && <Notice tone="warn">Payment was canceled. You have not been charged.</Notice>}
          {sp.error && <Notice tone="danger">{ERRORS[sp.error] ?? ERRORS.checkout_failed}</Notice>}
        </div>

        <article className="rounded-lg border border-line bg-white p-5 md:p-8">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-green">Invoice</p>
              <h1 className="text-2xl md:text-3xl">{inv.number}</h1>
              {billTo && <p className="mt-1">Billed to {billTo}</p>}
            </div>
            <div className="text-right">
              <InvoiceStatusBadge status={inv.status} />
              {inv.issuedAt && <p className="mt-2 text-sm">Issued {formatDate(inv.issuedAt, biz.timeZone)}</p>}
              {inv.dueAt && balance > 0 && <p className="text-sm">Due {formatDate(inv.dueAt, biz.timeZone)}</p>}
            </div>
          </div>

          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Invoice items</caption>
            <thead>
              <tr className="border-b-2 border-line">
                <th scope="col" className="py-2 pr-2">Description</th>
                <th scope="col" className="py-2 px-2 text-right">Qty</th>
                <th scope="col" className="py-2 pl-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.id} className="border-b border-line">
                  <td className="py-2 pr-2">{l.description}</td>
                  <td className="py-2 px-2 text-right">{l.quantity}</td>
                  <td className="py-2 pl-2 text-right whitespace-nowrap">{formatCents(l.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="ml-auto mt-4 grid max-w-xs grid-cols-2 gap-y-1">
            <dt>Subtotal</dt>
            <dd className="text-right">{formatCents(inv.subtotalCents)}</dd>
            {inv.discountCents > 0 && (
              <>
                <dt>Discounts</dt>
                <dd className="text-right">-{formatCents(inv.discountCents)}</dd>
              </>
            )}
            {inv.taxCents > 0 && (
              <>
                <dt>Tax</dt>
                <dd className="text-right">{formatCents(inv.taxCents)}</dd>
              </>
            )}
            <dt className="font-semibold">Total</dt>
            <dd className="text-right font-semibold">{formatCents(inv.totalCents)}</dd>
            {inv.amountPaidCents > 0 && (
              <>
                <dt>Paid</dt>
                <dd className="text-right">-{formatCents(paidNet)}</dd>
              </>
            )}
            <dt className="border-t border-line pt-1 text-lg font-bold text-navy">Balance due</dt>
            <dd className="border-t border-line pt-1 text-right text-lg font-bold text-navy">{formatCents(balance)}</dd>
          </dl>

          <div className="mt-8 print:hidden">
            {inv.status === "VOID" ? (
              <Notice tone="neutral">This invoice has been voided. No payment is due.</Notice>
            ) : balance <= 0 ? (
              <Notice tone="green">This invoice is paid. Thank you!</Notice>
            ) : canPayOnline ? (
              <form action={payInvoiceByTokenAction} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <input type="hidden" name="token" value={token} />
                <SubmitButton size="lg" pendingText="Opening secure checkout...">
                  Pay securely with card — {formatCents(balance)}
                </SubmitButton>
                {deposit.isDeposit && (
                  <SubmitButton size="lg" variant="outline" name="deposit" value="1" pendingText="Opening secure checkout...">
                    Pay {formatCents(deposit.amountCents)} deposit
                  </SubmitButton>
                )}
                <p className="w-full text-sm text-body">You will be taken to Stripe, our secure card processor. We never see or store your card number.</p>
              </form>
            ) : (
              <Notice tone="warn" title={stripeOn ? "Payment" : NOT_CONFIGURED_LABEL}>
                To pay by check or cash, please contact us{contact.length ? ` at ${contact.join(" or ")}` : ""}. Checks can be made payable to {biz.name}.
              </Notice>
            )}
          </div>
        </article>
        <p className="mt-6 text-center text-sm text-body">
          {biz.name}
          {contact.length > 0 ? ` · ${contact.join(" · ")}` : ""}
        </p>
      </main>
    </div>
  );
}
