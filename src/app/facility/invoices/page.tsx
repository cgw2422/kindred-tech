import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { requirePortalUser } from "@/lib/facilities/portal-session";
import { listPortalInvoices } from "@/lib/facilities/portal";
import { EmptyState, Notice, PageHeader } from "@/components/ui";
import { InvoiceStatusBadge } from "@/components/status";
import { PortalForm } from "../_components/PortalForm";
import { emailPayLinkAction } from "../request/actions";

export const metadata: Metadata = { title: "Invoices" };

export default async function FacilityInvoicesPage() {
  const { user, ctx } = await requirePortalUser("/facility/invoices");
  const biz = await getSettings("business");
  if (!ctx.contact.canViewInvoices) {
    return (
      <div>
        <PageHeader eyebrow="Community Portal" title="Invoices" />
        <Notice tone="neutral">Your account does not have access to invoices. Please ask your community&apos;s billing contact{biz.phone ? ` or call us at ${biz.phone}` : ""}.</Notice>
      </div>
    );
  }
  const { invoices } = await listPortalInvoices(user.id);
  const tz = biz.timeZone;
  return (
    <div>
      <PageHeader eyebrow="Community Portal" title="Invoices" description={`Invoices to ${ctx.facility.name}. Resident sessions are billed to residents directly and are not shown here.`} />
      {invoices.length === 0 ? (
        <EmptyState title="No invoices yet" />
      ) : (
        <div className="space-y-4">
          {invoices.map((inv) => {
            const balance = inv.totalCents - inv.amountPaidCents + inv.amountRefundedCents;
            const payable = (inv.status === "OPEN" || inv.status === "PARTIALLY_PAID") && balance > 0;
            return (
              <article key={inv.id} className="rounded-lg border border-line bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg">Invoice {inv.number}</h2>
                    <p className="text-sm">
                      {inv.issuedAt ? `Issued ${formatDate(inv.issuedAt, tz, { weekday: undefined })}` : ""}
                      {inv.dueAt && payable ? ` · Due ${formatDate(inv.dueAt, tz, { weekday: undefined })}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <InvoiceStatusBadge status={inv.status} />
                    <p className="mt-1 font-heading text-2xl text-navy">{formatCents(inv.totalCents)}</p>
                    {payable && inv.amountPaidCents > 0 && <p className="text-sm">Balance {formatCents(balance)}</p>}
                  </div>
                </div>
                {inv.lines.length > 0 && (
                  <ul className="mt-3 space-y-1 text-[0.95rem]">
                    {inv.lines.map((l, i) => (
                      <li key={i} className="flex justify-between gap-4 border-b border-line/60 pb-1">
                        <span>
                          {l.description}
                          {l.quantity > 1 ? ` × ${l.quantity}` : ""}
                        </span>
                        <span>{formatCents(l.amountCents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {payable && (
                  <div className="mt-4">
                    <PortalForm action={emailPayLinkAction} submitLabel="Email me a payment link" pendingLabel="Sending..." size="sm" variant="secondary">
                      <input type="hidden" name="id" value={inv.id} />
                      <p className="mb-2 text-sm">For your security, payment links are only sent by email to the billing contact on file.</p>
                    </PortalForm>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {(biz.phone || biz.email) && (
        <p className="mt-6 text-sm">
          Questions about an invoice? Contact us{biz.phone ? ` at ${biz.phone}` : ""}
          {biz.phone && biz.email ? " or " : biz.email ? " at " : ""}
          {biz.email ? <a href={`mailto:${biz.email}`}>{biz.email}</a> : null}.
        </p>
      )}
    </div>
  );
}
