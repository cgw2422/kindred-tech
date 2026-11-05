import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Badge, Card, DefinitionList, Notice, PageHeader, SectionTitle, Table, Td, Th } from "@/components/ui";
import { AppointmentStatusBadge, humanize, InvoiceStatusBadge } from "@/components/status";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { formatCents } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { computeSavingsTotals, DECISION_LABELS, FREQUENCY_LABELS, SUBSCRIPTION_CATEGORY_LABELS } from "@/lib/subscriptions";
import { formatDuration, totalElapsedMs } from "@/lib/tech/access";
import { buildWorkOrderInvoiceLines, getWorkOrderDetail } from "@/lib/tech/admin-work-orders";
import { parseChecklist } from "@/lib/tech/checklist";
import { formatDateTime, formatTime } from "@/lib/time";
import { CreateInvoiceForm } from "./CreateInvoiceForm";

export const metadata: Metadata = { title: "Work Order" };

export default async function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("appointments:view", `/admin/work-orders/${id}`);
  const [wo, biz] = await Promise.all([getWorkOrderDetail(id), getSettings("business")]);
  if (!wo) notFound();
  const tz = biz.timeZone;
  const appt = wo.appointment;
  const checklist = parseChecklist(wo.checklist);
  const totalMs = totalElapsedMs(wo.timeEntries);
  const running = wo.timeEntries.some((e) => !e.endedAt);
  const additionalTotal = wo.additionalWork.reduce((s, w) => s + w.priceCents, 0);
  const review = wo.subscriptionReview;
  const savings = review ? computeSavingsTotals(review.items) : null;
  const previewLines = buildWorkOrderInvoiceLines({ estimateBreakdown: appt.estimateBreakdown, service: appt.service, additionalWork: wo.additionalWork });
  const canManage = can(user.role, "appointments:manage");
  const canBilling = can(user.role, "billing:view");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Work order"
        title={`${appt.customer.firstName} ${appt.customer.lastName} — ${appt.service.name}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {formatDateTime(appt.startsAt, tz)} · Ref. {appt.reference} <AppointmentStatusBadge status={appt.status} />
            <Badge tone={wo.status === "COMPLETED" ? "neutral" : "green"}>Work order: {humanize(wo.status)}</Badge>
          </span>
        }
        actions={
          <Link href="/admin/work-orders" className="font-semibold">
            All work orders
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>Overview</SectionTitle>
          <DefinitionList
            items={[
              ["Customer", <Link key="c" href={`/admin/customers/${appt.customer.id}`}>{`${appt.customer.firstName} ${appt.customer.lastName}`}</Link>],
              ["Phone", appt.customer.phone],
              ["Address", appt.address ? `${appt.address.line1}, ${appt.address.city}, ${appt.address.state} ${appt.address.postalCode}` : appt.isRemote ? "Remote" : null],
              ["Technician", wo.technician?.displayName],
              ["Appointment", <Link key="a" href={`/admin/appointments/${appt.id}`}>View appointment</Link>],
              ["Completed", wo.completedAt ? formatDateTime(wo.completedAt, tz) : null],
              ["Invoice requested", wo.invoiceRequestedAt ? formatDateTime(wo.invoiceRequestedAt, tz) : null],
            ]}
          />
        </Card>

        <Card>
          <SectionTitle>Time</SectionTitle>
          <p className="font-heading text-3xl text-navy">{formatDuration(totalMs)}</p>
          {running && <p className="text-sm font-semibold text-green-dark">Timer is running</p>}
          {wo.timeEntries.length === 0 ? (
            <p className="mt-2 text-body">No time recorded.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {wo.timeEntries.map((e) => (
                <li key={e.id}>
                  {formatDateTime(e.startedAt, tz)} – {e.endedAt ? formatTime(e.endedAt, tz) : "running"}
                  {e.endedAt && <span className="text-body"> ({formatDuration(e.endedAt.getTime() - e.startedAt.getTime())})</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionTitle>Checklist</SectionTitle>
          <ul className="space-y-1">
            {checklist.map((c, i) => (
              <li key={`${i}-${c.label}`} className="flex items-start gap-2">
                <span aria-hidden="true" className={c.done ? "text-green-dark" : "text-body"}>
                  {c.done ? "✓" : "○"}
                </span>
                <span>
                  {c.label}
                  <span className="sr-only">{c.done ? " (done)" : " (not done)"}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <SectionTitle>Notes</SectionTitle>
          <h3 className="text-base">Troubleshooting notes</h3>
          <p className="whitespace-pre-wrap">{wo.troubleshootingNotes || "—"}</p>
          <h3 className="mt-4 text-base">Visit summary (customer-facing)</h3>
          <p className="whitespace-pre-wrap">{wo.resolutionSummary || "—"}</p>
        </Card>

        <Card>
          <SectionTitle>Additional work</SectionTitle>
          {wo.additionalWork.length === 0 ? (
            <p className="text-body">None recorded.</p>
          ) : (
            <>
              <ul className="divide-y divide-line">
                {wo.additionalWork.map((w) => (
                  <li key={w.id} className="py-2">
                    <p className="font-semibold text-navy">
                      {w.description} — {formatCents(w.priceCents)}
                    </p>
                    <p className="text-sm text-body">
                      {w.minutes} min · approved by {w.approvedByName} ({humanize(w.approvalMethod)}) {formatDateTime(w.approvedAt, tz)}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-2 font-semibold">Total additional: {formatCents(additionalTotal)}</p>
            </>
          )}
        </Card>

        <Card>
          <SectionTitle>Customer signature</SectionTitle>
          {wo.signedAt ? (
            <>
              {wo.signatureDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={wo.signatureDataUrl} alt={`Signature of ${wo.signedByName}`} className="w-full max-w-md rounded-md border border-line bg-white" />
              ) : (
                <p className="font-heading text-2xl italic text-navy">{wo.signedByName}</p>
              )}
              <p className="mt-2 text-sm text-body">
                Signed by {wo.signedByName} on {formatDateTime(wo.signedAt, tz)}
                {!wo.signatureDataUrl && " (typed name)"}
              </p>
            </>
          ) : (
            <p className="text-body">Not signed.</p>
          )}
        </Card>
      </div>

      <Card>
        <SectionTitle>Subscription Review &amp; Savings</SectionTitle>
        {!review ? (
          <p className="text-body">No subscription review for this visit.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-body">
              {review.authorizationConfirmed ? `Authorized by ${review.authorizedByName}${review.authorizedAt ? ` on ${formatDateTime(review.authorizedAt, tz)}` : ""}.` : "Not authorized."}
            </p>
            {savings && (
              <p className="mb-3">
                Monthly spend {formatCents(savings.currentMonthlySpendCents)} · est. savings {formatCents(savings.estimatedMonthlySavingsCents)}/mo ({formatCents(savings.estimatedAnnualSavingsCents)}/yr){" "}
                <span className="text-sm font-semibold text-warn">Estimated - not guaranteed</span>
              </p>
            )}
            {review.items.length > 0 && (
              <Table caption="Subscriptions reviewed">
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Category</Th>
                    <Th>Price</Th>
                    <Th>Decision</Th>
                    <Th>Est. savings / mo</Th>
                    <Th>Follow-up</Th>
                  </tr>
                </thead>
                <tbody>
                  {review.items.map((it) => (
                    <tr key={it.id}>
                      <Td>{it.name}</Td>
                      <Td>{SUBSCRIPTION_CATEGORY_LABELS[it.category]}</Td>
                      <Td>
                        {formatCents(it.priceCents)} {FREQUENCY_LABELS[it.frequency].toLowerCase()}
                      </Td>
                      <Td>
                        {DECISION_LABELS[it.decision]}
                        {it.cancellationAssisted && <span className="block text-sm text-body">Assisted</span>}
                      </Td>
                      <Td>{formatCents(it.estimatedMonthlySavingsCents)}</Td>
                      <Td>{it.followUpNeeded ? it.followUpNotes || "Yes" : "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            {review.notes && <p className="mt-3 whitespace-pre-wrap">{review.notes}</p>}
          </>
        )}
      </Card>

      <Card>
        <SectionTitle>Invoice</SectionTitle>
        {appt.invoices.length > 0 ? (
          <ul className="space-y-1">
            {appt.invoices.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3">
                {canBilling ? <Link href={`/admin/invoices/${inv.id}`}>{inv.number}</Link> : inv.number}
                <InvoiceStatusBadge status={inv.status} />
                <span>{formatCents(inv.totalCents)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <>
            {wo.invoiceRequestedAt && <Notice tone="warn">The technician requested an invoice on {formatDateTime(wo.invoiceRequestedAt, tz)}.</Notice>}
            <p className="mt-3 mb-2 font-semibold text-navy">Draft invoice lines</p>
            <ul className="mb-4 space-y-1">
              {previewLines.map((l, i) => (
                <li key={i} className="flex justify-between gap-4 border-b border-line py-1">
                  <span>{l.description}</span>
                  <span>{formatCents(l.unitPriceCents)}</span>
                </li>
              ))}
            </ul>
            <p className="mb-3 text-sm text-body">Tax is calculated when the invoice is created. The invoice is created as a draft so you can review it before sending.</p>
            {canManage ? <CreateInvoiceForm workOrderId={wo.id} /> : <p className="text-body">You do not have permission to create invoices.</p>}
          </>
        )}
      </Card>
    </div>
  );
}
