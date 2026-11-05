import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { centsToDollarString, formatCents } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/time";
import { invoiceBalance } from "@/lib/pricing";
import { getSettings } from "@/lib/settings";
import { invoiceRecipient } from "@/lib/billing/invoices";
import { committedRefundCents } from "@/lib/payments/ledger";
import { currentPayLink, isStripeConfigured, NOT_CONFIGURED_LABEL, payableAmount } from "@/lib/payments/stripe";
import { Card, DefinitionList, Notice, PageHeader, SectionTitle, Table, Td, Th } from "@/components/ui";
import { InvoiceStatusBadge, PaymentStatusBadge, humanize } from "@/components/status";
import { SubmitButton } from "@/components/forms";
import { startInvoiceCheckoutAction } from "../actions";
import { CopyLink, EditInvoiceForm, IssueInvoiceForm, ManualPaymentForm, PrintButton, RefundForm, RegenerateLinkForm, VoidInvoiceForm } from "../_components/InvoiceForms";

export const metadata: Metadata = { title: "Invoice" };

const PRINT_CSS = `
@media print {
  body { background: #fff !important; }
  aside, #admin-main ~ *, body header:not(.invoice-print-header) { display: none !important; }
  #admin-main { padding: 0 !important; }
  .no-print { display: none !important; }
  .print-only { display: block !important; }
  .invoice-sheet { border: 0 !important; padding: 0 !important; }
}
.print-only { display: none; }
`;

export default async function InvoiceDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const user = await requirePermission("billing:view", `/admin/invoices/${id}`);
  const sp = await searchParams;
  const inv = await prisma.invoice.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      customer: true,
      facility: { include: { contacts: true } },
      billToContact: true,
      appointment: { select: { id: true, startsAt: true } },
      payments: { include: { refunds: { orderBy: { createdAt: "asc" } }, recordedBy: { select: { name: true } } }, orderBy: { receivedAt: "asc" } },
    },
  });
  if (!inv) notFound();
  const [biz, services] = await Promise.all([
    getSettings("business"),
    prisma.service.findMany({ where: { isActive: true }, select: { id: true, name: true, basePriceCents: true }, orderBy: { name: "asc" } }),
  ]);
  const manage = can(user.role, "billing:manage");
  const refundOk = can(user.role, "billing:refund");
  const stripeOn = isStripeConfigured();
  const balance = inv.status === "VOID" || inv.status === "DRAFT" ? 0 : invoiceBalance(inv);
  const editable = ["DRAFT", "OPEN"].includes(inv.status) && inv.amountPaidCents === 0;
  const payable = ["OPEN", "PARTIALLY_PAID"].includes(inv.status) && balance > 0;
  const payLink = currentPayLink(inv);
  const recipient = await invoiceRecipient(inv);
  const deposit = payableAmount(inv, { payDeposit: true });
  const billToName = inv.customer ? `${inv.customer.firstName} ${inv.customer.lastName}` : (inv.facility?.name ?? "—");

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="no-print">
        <PageHeader
          eyebrow="Invoice"
          title={inv.number}
          description={
            <span className="flex flex-wrap items-center gap-2">
              <InvoiceStatusBadge status={inv.status} />
              {payable && !stripeOn && <span className="text-sm font-semibold text-warn">{NOT_CONFIGURED_LABEL}</span>}
            </span>
          }
          actions={
            <>
              <PrintButton />
              <Link href="/admin/invoices" className="self-center">
                All invoices
              </Link>
            </>
          }
        />
        <div className="mb-4 space-y-3">
          {sp.error && <Notice tone="danger">{sp.error}</Notice>}
          {sp.status === "success" && <Notice tone="green">Stripe Checkout completed. The payment will appear here once Stripe confirms it by webhook.</Notice>}
          {sp.status === "canceled" && <Notice tone="warn">Stripe Checkout was canceled. No payment was taken.</Notice>}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card className="invoice-sheet">
            <div className="print-only mb-6">
              <p className="font-heading text-2xl text-navy">{biz.name}</p>
              <p className="text-sm">{[biz.addressLine, biz.city, biz.state, biz.postalCode].filter(Boolean).join(", ")}</p>
              <p className="text-sm">{[biz.phone, biz.email].filter(Boolean).join(" · ")}</p>
              <p className="mt-4 text-xl font-bold">Invoice {inv.number}</p>
            </div>
            <DefinitionList
              items={[
                [
                  "Bill to",
                  <>
                    {inv.customer ? (
                      <Link href={`/admin/customers/${inv.customer.id}`} className="no-print-link">
                        {billToName}
                      </Link>
                    ) : inv.facility ? (
                      <Link href={`/admin/facilities/${inv.facility.id}`}>{billToName}</Link>
                    ) : (
                      billToName
                    )}
                    {inv.billToContact && (
                      <span className="block text-sm">
                        Paid by family contact: {inv.billToContact.name}
                        {inv.billToContact.relationship ? ` (${inv.billToContact.relationship})` : ""}
                      </span>
                    )}
                  </>,
                ],
                ["Email to", recipient.email ?? "No email on file"],
                ["Issued", inv.issuedAt ? formatDate(inv.issuedAt, biz.timeZone) : "Not issued yet"],
                ["Due", inv.dueAt ? formatDate(inv.dueAt, biz.timeZone) : "—"],
                ...(inv.appointment ? ([["Appointment", <Link key="a" href={`/admin/appointments/${inv.appointment.id}`}>{formatDateTime(inv.appointment.startsAt, biz.timeZone)}</Link>]] as [string, React.ReactNode][]) : []),
                ...(inv.depositCents > 0 ? ([["Deposit", formatCents(inv.depositCents)]] as [string, React.ReactNode][]) : []),
              ]}
            />
            <div className="mt-6">
              <Table caption="Invoice lines">
                <thead>
                  <tr>
                    <Th>Description</Th>
                    <Th className="text-right">Qty</Th>
                    <Th className="text-right">Unit price</Th>
                    <Th className="text-right">Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {inv.lines.map((l) => (
                    <tr key={l.id}>
                      <Td>{l.description}</Td>
                      <Td className="text-right">{l.quantity}</Td>
                      <Td className="text-right">{formatCents(l.unitPriceCents)}</Td>
                      <Td className="text-right">{formatCents(l.amountCents)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <dl className="ml-auto mt-4 grid max-w-xs grid-cols-2 gap-y-1">
              <dt>Subtotal</dt>
              <dd className="text-right">{formatCents(inv.subtotalCents)}</dd>
              {inv.discountCents > 0 && (
                <>
                  <dt>Discounts</dt>
                  <dd className="text-right">-{formatCents(inv.discountCents)}</dd>
                </>
              )}
              <dt>Tax</dt>
              <dd className="text-right">{formatCents(inv.taxCents)}</dd>
              <dt className="font-bold">Total</dt>
              <dd className="text-right font-bold">{formatCents(inv.totalCents)}</dd>
              <dt>Paid</dt>
              <dd className="text-right">{formatCents(inv.amountPaidCents)}</dd>
              {inv.amountRefundedCents > 0 && (
                <>
                  <dt>Refunded</dt>
                  <dd className="text-right">-{formatCents(inv.amountRefundedCents)}</dd>
                </>
              )}
              <dt className="border-t border-line pt-1 text-lg font-bold text-navy">Balance</dt>
              <dd className="border-t border-line pt-1 text-right text-lg font-bold text-navy">{formatCents(balance)}</dd>
            </dl>
            {inv.notes && (
              <div className="mt-6">
                <p className="font-semibold text-navy">Notes</p>
                <p className="whitespace-pre-line">{inv.notes}</p>
              </div>
            )}
            {payable && (
              <p className="print-only mt-6 text-sm">
                {payLink ? `Pay online: ${payLink}` : "Please contact us to arrange payment."} Checks payable to {biz.name}.
              </p>
            )}
          </Card>

          <section className="no-print" aria-labelledby="payments-h">
            <SectionTitle id="payments-h">Payments</SectionTitle>
            {inv.payments.length === 0 ? (
              <p className="text-body">No payments yet.</p>
            ) : (
              <ul className="space-y-3">
                {inv.payments.map((p) => {
                  const refundable = p.amountCents - Math.max(p.refundedCents, committedRefundCents(p.refunds));
                  return (
                    <li key={p.id} className="rounded-lg border border-line bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-navy">
                          {formatCents(p.amountCents)} · {p.method === "STRIPE" ? "Card (Stripe)" : humanize(p.method)}
                          {p.method !== "STRIPE" && <span className="ml-2 text-sm font-normal text-body">Manually recorded{p.recordedBy ? ` by ${p.recordedBy.name}` : ""}</span>}
                        </p>
                        <PaymentStatusBadge status={p.status} />
                      </div>
                      <p className="text-sm text-body">
                        {formatDateTime(p.receivedAt, biz.timeZone)}
                        {p.reference && p.method !== "STRIPE" ? ` · Ref ${p.reference}` : ""}
                        {p.stripePaymentIntentId ? ` · ${p.stripePaymentIntentId}` : ""}
                        {p.failureReason ? ` · ${p.failureReason}` : ""}
                      </p>
                      {p.notes && <p className="text-sm">{p.notes}</p>}
                      {p.refunds.length > 0 && (
                        <ul className="mt-2 border-l-4 border-line pl-3 text-sm">
                          {p.refunds.map((r) => (
                            <li key={r.id}>
                              Refund {formatCents(r.amountCents)} — {r.status === "succeeded" ? (p.method === "STRIPE" ? "completed" : "recorded manually") : r.status}
                              {r.reason ? ` · ${r.reason}` : ""} · {formatDate(r.createdAt, biz.timeZone)}
                            </li>
                          ))}
                        </ul>
                      )}
                      {refundOk && refundable > 0 && ["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(p.status) && (p.method !== "STRIPE" || stripeOn) && (
                        <RefundForm paymentId={p.id} maxDollars={centsToDollarString(refundable)} isStripe={p.method === "STRIPE"} />
                      )}
                      {refundOk && p.method === "STRIPE" && !stripeOn && refundable > 0 && <p className="mt-2 text-sm text-body">Card refunds need Stripe to be configured.</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {manage && editable && (
            <section className="no-print" aria-labelledby="edit-h">
              <SectionTitle id="edit-h">Edit invoice</SectionTitle>
              <Card>
                <EditInvoiceForm
                  invoiceId={inv.id}
                  initialLines={inv.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: centsToDollarString(l.unitPriceCents), serviceId: l.serviceId }))}
                  depositDollars={inv.depositCents ? centsToDollarString(inv.depositCents) : ""}
                  notes={inv.notes ?? ""}
                  services={services}
                />
              </Card>
            </section>
          )}
        </div>

        <aside className="no-print space-y-4" aria-label="Invoice actions">
          {manage && inv.status === "DRAFT" && (
            <Card>
              <h2 className="mb-2 text-lg">Issue invoice</h2>
              <p className="mb-3 text-sm">Issuing sets the due date and creates a private pay link for the customer.</p>
              <IssueInvoiceForm invoiceId={inv.id} hasEmail={Boolean(recipient.email)} />
            </Card>
          )}
          {manage && payable && (
            <Card>
              <h2 className="mb-2 text-lg">Collect payment</h2>
              {payLink ? (
                <div className="mb-3">
                  <p className="mb-1 text-sm font-semibold text-navy">Customer pay link</p>
                  <CopyLink url={payLink} />
                </div>
              ) : (
                <p className="mb-2 text-sm">The pay link was shown when the invoice was issued. Create a new one to copy it again.</p>
              )}
              <RegenerateLinkForm invoiceId={inv.id} />
              <hr className="my-4 border-line" />
              {stripeOn ? (
                <form action={startInvoiceCheckoutAction} className="space-y-2">
                  <input type="hidden" name="invoiceId" value={inv.id} />
                  <SubmitButton variant="primary" pendingText="Opening Stripe...">
                    Open card checkout ({formatCents(balance)})
                  </SubmitButton>
                  {deposit.isDeposit && (
                    <SubmitButton variant="outline" name="deposit" value="1" pendingText="Opening Stripe...">
                      Checkout for deposit ({formatCents(deposit.amountCents)})
                    </SubmitButton>
                  )}
                  <p className="text-sm text-body">Opens Stripe&rsquo;s secure page. The payment is recorded only when Stripe confirms it.</p>
                </form>
              ) : (
                <Notice tone="warn" title="Card payments unavailable">
                  Online card payment is not configured (no Stripe key). Record cash or check payments below.
                </Notice>
              )}
            </Card>
          )}
          {manage && payable && (
            <Card>
              <h2 className="mb-2 text-lg">Record manual payment</h2>
              <p className="mb-3 text-sm">For cash or checks received in person. Card payments are recorded automatically by Stripe.</p>
              <ManualPaymentForm invoiceId={inv.id} balanceDollars={centsToDollarString(balance)} />
            </Card>
          )}
          {manage && inv.status !== "VOID" && inv.amountPaidCents === 0 && (
            <Card>
              <h2 className="mb-2 text-lg">Void</h2>
              <p className="mb-3 text-sm">Cancels the invoice. Invoices with payments cannot be voided; refund instead.</p>
              <VoidInvoiceForm invoiceId={inv.id} />
            </Card>
          )}
          <Card>
            <h2 className="mb-2 text-lg">History</h2>
            <DefinitionList
              items={[
                ["Created", formatDateTime(inv.createdAt, biz.timeZone)],
                ["Updated", formatDateTime(inv.updatedAt, biz.timeZone)],
                ...(inv.voidedAt ? ([["Voided", formatDateTime(inv.voidedAt, biz.timeZone)]] as [string, React.ReactNode][]) : []),
              ]}
            />
          </Card>
        </aside>
      </div>
    </>
  );
}
