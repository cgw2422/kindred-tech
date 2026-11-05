import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { Badge, Card, DefinitionList, PageHeader, Table, Td, Th } from "@/components/ui";
import { AppointmentStatusBadge, InvoiceStatusBadge, humanize } from "@/components/status";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/forms";
import { readFlash } from "@/lib/admin-helpers";
import { allowedNextStatuses, STATUS_LABELS } from "@/lib/booking/status";
import { formatDateTime, formatTime, toDateKey, zonedParts } from "@/lib/time";
import { formatCents } from "@/lib/money";
import {
  assignTechnicianAction,
  changeStatusAction,
  createInvoiceFromAppointmentAction,
  rescheduleAction,
  resendConfirmationAction,
  updateNotesAction,
} from "../actions";

export const metadata = { title: "Appointment" };

type EstimateJson = { lines?: { label: string; amountCents: number }[]; totalCents?: number; note?: string };

export default async function AppointmentDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("appointments:view", "/admin/appointments");
  const { id } = await params;
  const flash = readFlash(await searchParams);
  const [appt, biz, techs] = await Promise.all([
    prisma.appointment.findUnique({
      where: { id },
      include: {
        customer: { include: { familyContacts: true } },
        service: true,
        technician: true,
        address: true,
        facility: true,
        techHelpDay: true,
        discount: true,
        statusChanges: { orderBy: { createdAt: "asc" }, include: { changedBy: { select: { name: true } } } },
        workOrder: true,
        invoices: true,
      },
    }),
    getSettings("business"),
    prisma.technician.findMany({ where: { isActive: true }, orderBy: { displayName: "asc" } }),
  ]);
  if (!appt) notFound();
  const comms = await prisma.communication.findMany({ where: { relatedType: "Appointment", relatedId: appt.id }, orderBy: { createdAt: "desc" }, take: 20 });
  const manage = can(user.role, "appointments:manage");
  const next = allowedNextStatuses(appt.status, user.role);
  const estimate = appt.estimateBreakdown as EstimateJson | null;
  const local = zonedParts(appt.startsAt, biz.timeZone);
  const timeValue = `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`;
  const mapsUrl = appt.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${appt.address.line1}, ${appt.address.city}, ${appt.address.state} ${appt.address.postalCode}`)}` : null;

  return (
    <div>
      <PageHeader
        eyebrow={`Appointment ${appt.reference}`}
        title={`${appt.service.name} for ${appt.customer.firstName} ${appt.customer.lastName}`}
        description={
          <span className="flex flex-wrap items-center gap-3">
            <AppointmentStatusBadge status={appt.status} />
            <span>
              {formatDateTime(appt.startsAt, biz.timeZone)} to {formatTime(appt.endsAt, biz.timeZone)}
            </span>
            {appt.internalNotes?.includes("outside the configured service area") && <Badge tone="warn">Outside service area</Badge>}
          </span>
        }
      />
      <Flash flash={flash} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <h2 className="mb-4 text-xl">Details</h2>
            <DefinitionList
              items={[
                ["Customer", <Link key="c" href={`/admin/customers/${appt.customerId}`}>{appt.customer.firstName} {appt.customer.lastName}</Link>],
                ["Phone", appt.customer.phone ? <a href={`tel:${appt.customer.phone}`}>{appt.customer.phone}</a> : "—"],
                ["Email", appt.customer.email ?? "—"],
                ["Booked by", appt.bookedForSelf ? "Customer" : `${appt.requesterName} (${appt.requesterRelation ?? "family"}) ${appt.requesterEmail ?? ""} ${appt.requesterPhone ?? ""}`],
                ["Location", appt.isRemote ? "Remote session" : appt.address ? <span key="a">{appt.address.line1}{appt.address.line2 ? `, ${appt.address.line2}` : ""}, {appt.address.city}, {appt.address.state} {appt.address.postalCode} {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer" className="ml-2 text-sm">Map</a>}</span> : "—"],
                ["Access notes", appt.address?.accessNotes ?? "—"],
                ["Facility", appt.facility ? <Link key="f" href={`/admin/facilities/${appt.facility.id}`}>{appt.facility.name}</Link> : "—"],
                ["Source", humanize(appt.source)],
                ["Lead source", appt.leadSource ?? "—"],
                ["Problem", <span key="p" className="whitespace-pre-wrap">{appt.problemDescription ?? "—"}</span>],
              ]}
            />
          </Card>

          <Card>
            <h2 className="mb-3 text-xl">Estimate</h2>
            {estimate?.lines ? (
              <ul className="space-y-1">
                {estimate.lines.map((l, i) => (
                  <li key={i} className="flex justify-between gap-4">
                    <span>{l.label}</span>
                    <span>{formatCents(l.amountCents)}</span>
                  </li>
                ))}
                <li className="flex justify-between border-t border-line pt-2 font-bold text-navy">
                  <span>Estimated total</span>
                  <span>{appt.estimatedTotalCents != null ? formatCents(appt.estimatedTotalCents) : "Custom quote"}</span>
                </li>
              </ul>
            ) : (
              <p>No estimate recorded.</p>
            )}
            {estimate?.note && <p className="mt-2 text-sm">{estimate.note}</p>}
            <div className="mt-4 flex flex-wrap gap-3">
              {appt.invoices.map((inv) => (
                <Link key={inv.id} href={`/admin/invoices/${inv.id}`} className="inline-flex items-center gap-2">
                  Invoice {inv.number} <InvoiceStatusBadge status={inv.status} />
                </Link>
              ))}
              {can(user.role, "billing:manage") && (
                <form action={createInvoiceFromAppointmentAction}>
                  <input type="hidden" name="id" value={appt.id} />
                  <SubmitButton variant="outline" size="sm" pendingText="Creating...">
                    Create invoice from estimate
                  </SubmitButton>
                </form>
              )}
              {appt.workOrder && (
                <Link href={`/admin/work-orders/${appt.workOrder.id}`} className="font-semibold">
                  View work order
                </Link>
              )}
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-xl">Internal notes</h2>
            <form action={updateNotesAction}>
              <input type="hidden" name="id" value={appt.id} />
              <label htmlFor="internalNotes" className="sr-only">
                Internal notes
              </label>
              <textarea id="internalNotes" name="internalNotes" rows={4} defaultValue={appt.internalNotes ?? ""} className="mb-3 block w-full rounded-md border-2 border-line p-3" disabled={!manage} />
              {manage && <SubmitButton size="sm">Save notes</SubmitButton>}
            </form>
          </Card>

          <Card>
            <h2 className="mb-3 text-xl">History</h2>
            <ol className="space-y-2">
              {appt.statusChanges.map((s) => (
                <li key={s.id} className="flex flex-wrap gap-2 text-[0.95rem]">
                  <span className="font-semibold">{formatDateTime(s.createdAt, biz.timeZone)}</span>
                  <span>
                    {s.fromStatus ? `${STATUS_LABELS[s.fromStatus]} to ` : ""}
                    {STATUS_LABELS[s.toStatus]}
                  </span>
                  <span className="text-body/80">by {s.changedBy?.name ?? "system / customer"}</span>
                  {s.note && <span className="w-full pl-4 text-sm">{s.note}</span>}
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <h2 className="mb-3 text-xl">Emails for this appointment</h2>
            {comms.length === 0 ? (
              <p>No emails yet.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th>To</Th>
                    <Th>Template</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {comms.map((c) => (
                    <tr key={c.id}>
                      <Td>{formatDateTime(c.createdAt, biz.timeZone)}</Td>
                      <Td>{c.toAddress}</Td>
                      <Td>{c.templateKey}</Td>
                      <Td>
                        {humanize(c.status)}
                        {c.statusReason && <span className="block text-xs">{c.statusReason}</span>}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        {manage && (
          <div className="space-y-6">
            <Card>
              <h2 className="mb-3 text-xl">Update status</h2>
              {next.length === 0 ? (
                <p>No further status changes are available.</p>
              ) : (
                <div className="space-y-3">
                  {next
                    .filter((s) => s !== "CANCELED")
                    .map((s) => (
                      <form key={s} action={changeStatusAction}>
                        <input type="hidden" name="id" value={appt.id} />
                        <input type="hidden" name="to" value={s} />
                        <SubmitButton variant={s === "CONFIRMED" ? "primary" : "outline"} className="w-full">
                          Mark {STATUS_LABELS[s]}
                        </SubmitButton>
                      </form>
                    ))}
                  {next.includes("CANCELED") && (
                    <form action={changeStatusAction} className="border-t border-line pt-3">
                      <input type="hidden" name="id" value={appt.id} />
                      <input type="hidden" name="to" value="CANCELED" />
                      <label htmlFor="cancelReason" className="mb-1 block text-sm font-semibold text-navy">
                        Cancellation reason
                      </label>
                      <input id="cancelReason" name="cancelReason" className="mb-2 block w-full rounded-md border-2 border-line px-3 py-2" />
                      <SubmitButton variant="danger" className="w-full" confirm="Cancel this appointment and notify the customer?">
                        Cancel appointment
                      </SubmitButton>
                    </form>
                  )}
                </div>
              )}
              {["REQUESTED", "CONFIRMED", "ASSIGNED"].includes(appt.status) && (
                <form action={resendConfirmationAction} className="mt-3">
                  <input type="hidden" name="id" value={appt.id} />
                  <SubmitButton variant="ghost" size="sm">
                    Resend confirmation email
                  </SubmitButton>
                </form>
              )}
            </Card>

            <Card>
              <h2 className="mb-3 text-xl">Technician</h2>
              <form action={assignTechnicianAction}>
                <input type="hidden" name="id" value={appt.id} />
                <label htmlFor="technicianId" className="mb-1 block font-semibold text-navy">
                  Assigned technician
                </label>
                <select id="technicianId" name="technicianId" defaultValue={appt.technicianId ?? ""} className="mb-2 block w-full rounded-md border-2 border-line px-3 py-2">
                  <option value="">Unassigned</option>
                  {techs.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.displayName}
                    </option>
                  ))}
                </select>
                <label className="mb-3 flex items-center gap-2 text-sm">
                  <input type="checkbox" name="allowOutsideHours" className="h-4 w-4" /> Allow outside working hours
                </label>
                <SubmitButton size="sm">Save assignment</SubmitButton>
              </form>
            </Card>

            {["REQUESTED", "CONFIRMED", "ASSIGNED"].includes(appt.status) && (
              <Card>
                <h2 className="mb-3 text-xl">Reschedule</h2>
                <form action={rescheduleAction}>
                  <input type="hidden" name="id" value={appt.id} />
                  <label htmlFor="date" className="mb-1 block font-semibold text-navy">
                    Date
                  </label>
                  <input id="date" name="date" type="date" required defaultValue={toDateKey(appt.startsAt, biz.timeZone)} className="mb-2 block w-full rounded-md border-2 border-line px-3 py-2" />
                  <label htmlFor="time" className="mb-1 block font-semibold text-navy">
                    Start time (Eastern)
                  </label>
                  <input id="time" name="time" type="time" step={900} required defaultValue={timeValue} className="mb-2 block w-full rounded-md border-2 border-line px-3 py-2" />
                  <label htmlFor="rs-tech" className="mb-1 block font-semibold text-navy">
                    Technician
                  </label>
                  <select id="rs-tech" name="technicianId" defaultValue={appt.technicianId ?? "auto"} className="mb-2 block w-full rounded-md border-2 border-line px-3 py-2">
                    <option value="auto">Any available</option>
                    {techs.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.displayName}
                      </option>
                    ))}
                  </select>
                  <label className="mb-3 flex items-center gap-2 text-sm">
                    <input type="checkbox" name="allowOutsideHours" className="h-4 w-4" /> Allow outside business hours
                  </label>
                  <SubmitButton size="sm">Reschedule and notify</SubmitButton>
                </form>
              </Card>
            )}

            <Card>
              <h2 className="mb-3 text-xl">Authorized contacts</h2>
              {appt.customer.familyContacts.length === 0 ? (
                <p>None on file.</p>
              ) : (
                <ul className="space-y-2">
                  {appt.customer.familyContacts.map((f) => (
                    <li key={f.id}>
                      <span className="font-semibold">{f.name}</span> {f.relationship && `(${f.relationship})`}
                      <span className="block text-sm">
                        {[f.canSchedule && "schedule", f.canPay && "pay", f.canReceiveUpdates && "updates", f.canViewServiceDetails && "service details"].filter(Boolean).join(", ") || "no permissions"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
