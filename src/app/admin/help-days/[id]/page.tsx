import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { formatCents } from "@/lib/money";
import { formatDate, formatDateTime, formatTime } from "@/lib/time";
import { Badge, ButtonLink, Card, DefinitionList, Notice, PageHeader, SectionTitle, Table, Td, Th } from "@/components/ui";
import { AppointmentStatusBadge, InvoiceStatusBadge } from "@/components/status";
import { SubmitButton } from "@/components/forms";
import { ActionForm } from "../../_config/ActionForm";
import { RowAction } from "../../_config/RowAction";
import { getHelpDayForStaff, HELP_DAY_PAYMENT_LABELS, helpDaySignupUrl } from "@/lib/facilities/help-days";
import { describeRule, type SeriesFrequency } from "@/lib/facilities/recurrence";
import { HelpDayStatusBadge } from "../../facilities/_components/badges";
import { FCheckbox, FInput, FSelect, FTextArea } from "../../facilities/_components/fields";
import { HelpDayFields } from "../_components/HelpDayFields";
import {
  bookResidentAction,
  cancelHelpDayAction,
  cancelResidentAction,
  completeHelpDayAction,
  confirmHelpDayAction,
  createSponsoredInvoiceAction,
  updateHelpDayAction,
} from "../actions";

export const metadata: Metadata = { title: "Tech Help Day" };

export default async function HelpDayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("facilities:view", `/admin/help-days/${id}`);
  const canManage = can(user.role, "facilities:manage");
  const canBill = can(user.role, "billing:manage");
  const tz = (await getSettings("business")).timeZone;
  const now = new Date();
  const data = await getHelpDayForStaff(id, now);
  if (!data) notFound();
  const { day, grid, activeAppointments, residentPriceCents } = data;
  const technicians = await prisma.technician.findMany({ where: { isActive: true }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } });
  const open = day.status === "SCHEDULED" || day.status === "CONFIRMED";
  const started = day.startsAt <= now;
  const freeSlots = grid.filter((s) => !s.appointment);
  const inactive = day.appointments.filter((a) => a.status === "CANCELED" || a.status === "NO_SHOW");
  const signupUrl = helpDaySignupUrl(day.id);

  return (
    <div>
      <p className="mb-2 text-sm">
        <Link href="/admin/help-days">← Tech Help Days</Link> · <Link href={`/admin/facilities/${day.facility.id}`}>{day.facility.name}</Link>
      </p>
      <PageHeader
        eyebrow={`Tech Help Day · ${day.facility.name}`}
        title={formatDate(day.startsAt, tz)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <HelpDayStatusBadge status={day.status} />
            {formatTime(day.startsAt, tz)} to {formatTime(day.endsAt, tz)}
            {day.location ? ` · ${day.location}` : ""}
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/admin/help-days/${day.id}/sign-up-sheet`} variant="outline" target="_blank">
              Printable sign-up sheet
            </ButtonLink>
            {open && (
              <ButtonLink href={`/help-days/${day.id}`} variant="outline" target="_blank">
                Resident sign-up page
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Card>
            <SectionTitle>Schedule</SectionTitle>
            <p className="mb-3 text-sm">
              {activeAppointments.length} of {grid.length} sessions booked · {day.slotMinutes}-minute sessions
              {day.slotBufferMinutes ? ` with ${day.slotBufferMinutes}-minute breaks` : ""}
            </p>
            <Table caption="Resident sessions">
              <thead>
                <tr>
                  <Th>Time</Th>
                  <Th>Resident</Th>
                  <Th>Needs help with</Th>
                  <Th>Status</Th>
                  {canManage && <Th>
                    <span className="sr-only">Actions</span>
                  </Th>}
                </tr>
              </thead>
              <tbody>
                {grid.map((s) => (
                  <tr key={s.startsAt.toISOString()} className={s.appointment ? "" : "bg-soft/60"}>
                    <Td className="whitespace-nowrap font-semibold">{formatTime(s.startsAt, tz)}</Td>
                    {s.appointment ? (
                      <>
                        <Td>
                          <Link href={`/admin/customers/${s.appointment.customer.id}`} className="font-semibold">
                            {s.appointment.customer.firstName} {s.appointment.customer.lastName}
                          </Link>
                          <div className="text-sm">
                            {[s.appointment.customer.facilityUnit ? `Unit ${s.appointment.customer.facilityUnit}` : null, s.appointment.customer.phone, s.appointment.customer.email].filter(Boolean).join(" · ")}
                          </div>
                          {!s.appointment.bookedForSelf && s.appointment.requesterName && (
                            <div className="text-sm">
                              Booked by {s.appointment.requesterName}
                              {s.appointment.requesterRelation ? ` (${s.appointment.requesterRelation})` : ""}
                              {s.appointment.requesterPhone ? ` · ${s.appointment.requesterPhone}` : ""}
                            </div>
                          )}
                        </Td>
                        <Td className="max-w-xs text-sm">{s.appointment.problemDescription ?? "—"}</Td>
                        <Td>
                          <Link href={`/admin/appointments/${s.appointment.id}`} className="no-underline">
                            <AppointmentStatusBadge status={s.appointment.status} />
                          </Link>
                          <div className="text-sm">
                            {s.appointment.reference} · {formatCents(s.appointment.estimatedTotalCents ?? 0, { showFree: true })}
                          </div>
                        </Td>
                        {canManage && (
                          <Td>
                            {s.appointment.status !== "COMPLETED" && s.appointment.status !== "IN_PROGRESS" && (
                              <RowAction action={cancelResidentAction} id={s.appointment.id} label="Cancel" variant="ghost" confirm="Cancel this resident's session? They will be notified by email if we have their address." />
                            )}
                          </Td>
                        )}
                      </>
                    ) : (
                      <>
                        <Td>
                          <span className="text-body">{s.available ? "Open" : started ? "Not booked" : "Unavailable"}</span>
                        </Td>
                        <Td> </Td>
                        <Td> </Td>
                        {canManage && <Td> </Td>}
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
            {inactive.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer font-semibold text-navy">Canceled sessions ({inactive.length})</summary>
                <ul className="mt-2 list-disc pl-6 text-sm">
                  {inactive.map((a) => (
                    <li key={a.id}>
                      {formatTime(a.startsAt, tz)}: {a.customer.firstName} {a.customer.lastName} ({a.status.toLowerCase().replace("_", "-")}
                      {a.cancelReason ? `: ${a.cancelReason}` : ""})
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>

          {canManage && open && (
            <Card>
              <SectionTitle>Book a resident</SectionTitle>
              {freeSlots.length === 0 ? (
                <p>All sessions are booked.</p>
              ) : (
                <ActionForm action={bookResidentAction} resetOnSuccess>
                  <input type="hidden" name="id" value={day.id} />
                  <div className="grid gap-x-6 md:grid-cols-2">
                    <FSelect
                      id="book-slot"
                      label="Time"
                      name="startsAt"
                      required
                      options={freeSlots.map((s) => ({ value: s.startsAt.toISOString(), label: `${formatTime(s.startsAt, tz)}${s.startsAt <= now ? " (past)" : ""}` }))}
                    />
                    <FInput id="book-unit" label="Unit / apartment" name="unit" maxLength={50} />
                    <FInput id="book-first" label="First name" name="firstName" required maxLength={100} />
                    <FInput id="book-last" label="Last name" name="lastName" required maxLength={100} />
                    <FInput id="book-phone" label="Phone" name="phone" type="tel" />
                    <FInput id="book-email" label="Email" name="email" type="email" hint="We send a confirmation if given." />
                  </div>
                  <FTextArea id="book-problem" label="What they need help with" name="problemDescription" rows={2} maxLength={4000} />
                  <details className="mb-4">
                    <summary className="cursor-pointer font-semibold text-navy">Booked by a family member?</summary>
                    <div className="mt-3 grid gap-x-6 md:grid-cols-2">
                      <FInput id="book-req-name" label="Family member's name" name="requesterName" />
                      <FInput id="book-req-rel" label="Relationship" name="requesterRelation" />
                      <FInput id="book-req-phone" label="Their phone" name="requesterPhone" type="tel" />
                      <FInput id="book-req-email" label="Their email" name="requesterEmail" type="email" />
                    </div>
                  </details>
                  <p className="mb-3 text-sm">
                    Price for this resident: <strong>{formatCents(residentPriceCents, { showFree: true })}</strong>. Booking by staff records verbal agreement to the terms.
                  </p>
                  <SubmitButton pendingText="Booking...">Book session</SubmitButton>
                </ActionForm>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <SectionTitle>Details</SectionTitle>
            <DefinitionList
              items={[
                ["Community", <Link key="f" href={`/admin/facilities/${day.facility.id}`}>{day.facility.name}</Link>],
                ["Technician", day.technician?.displayName ?? "Unassigned"],
                ["Payment", HELP_DAY_PAYMENT_LABELS[day.paymentModel]],
                ["Resident price", formatCents(residentPriceCents, { showFree: true })],
                ...(day.paymentModel === "FACILITY_SPONSORED" ? ([["Sponsored price", day.sponsoredPriceCents != null ? formatCents(day.sponsoredPriceCents) : "Agreement session rate"]] as [string, string][]) : []),
                ["Series", day.series ? describeRule({ frequency: day.series.frequency as SeriesFrequency, dayOfWeek: day.series.dayOfWeek, weekOfMonth: day.series.weekOfMonth }) : "One-time"],
                ["Sign-up link", open ? <a key="u" href={signupUrl} className="break-all">{signupUrl}</a> : "Closed"],
                ["Notes", day.notes ? <span key="n" className="whitespace-pre-line">{day.notes}</span> : "—"],
              ]}
            />
          </Card>

          {canManage && (
            <Card>
              <SectionTitle>Status</SectionTitle>
              <div className="space-y-4">
                {open && (
                  <ActionForm action={confirmHelpDayAction}>
                    <input type="hidden" name="id" value={day.id} />
                    <p className="mb-2 text-sm">
                      {day.status === "SCHEDULED"
                        ? "Confirming emails the community's Primary and Activities Director contacts with the date and the resident sign-up link."
                        : "Confirmed. Re-sending only emails contacts who have not already been notified for this date."}
                    </p>
                    <SubmitButton size="sm" variant="secondary" pendingText="Confirming...">
                      {day.status === "SCHEDULED" ? "Confirm and notify community" : "Notify any new contacts"}
                    </SubmitButton>
                  </ActionForm>
                )}
                {open && started && (
                  <ActionForm action={completeHelpDayAction}>
                    <input type="hidden" name="id" value={day.id} />
                    <FCheckbox id="complete-mark" name="markCompleted" label="Also mark booked sessions completed" defaultChecked />
                    <SubmitButton size="sm" pendingText="Saving...">
                      Mark day completed
                    </SubmitButton>
                  </ActionForm>
                )}
                {open && (
                  <details>
                    <summary className="cursor-pointer font-semibold text-danger">Cancel this Tech Help Day</summary>
                    <ActionForm action={cancelHelpDayAction} className="mt-3">
                      <input type="hidden" name="id" value={day.id} />
                      <FInput id="cancel-reason" label="Reason (shared with residents)" name="reason" maxLength={500} />
                      {activeAppointments.length > 0 && (
                        <Notice tone="warn" title={`${activeAppointments.length} resident session(s) are booked`}>
                          <FCheckbox id="cancel-residents" name="cancelResidents" label="Cancel their sessions too and email them" />
                        </Notice>
                      )}
                      <div className="mt-3">
                        <SubmitButton size="sm" variant="danger" pendingText="Canceling..." confirm="Cancel this Tech Help Day?">
                          Cancel Tech Help Day
                        </SubmitButton>
                      </div>
                    </ActionForm>
                  </details>
                )}
                {!open && <p>This Tech Help Day is {day.status.toLowerCase()}.</p>}
              </div>
            </Card>
          )}

          {day.paymentModel === "FACILITY_SPONSORED" && (
            <Card>
              <SectionTitle>Community invoice</SectionTitle>
              {day.invoices.length > 0 && (
                <ul className="mb-3 space-y-1">
                  {day.invoices.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/invoices/${i.id}`} className="font-semibold">
                        {i.number}
                      </Link>
                      <InvoiceStatusBadge status={i.status} /> {formatCents(i.totalCents)}
                    </li>
                  ))}
                </ul>
              )}
              {canManage && canBill && day.status !== "CANCELED" && !day.invoices.some((i) => i.status !== "VOID") && (
                <RowAction action={createSponsoredInvoiceAction} id={day.id} label="Create sponsored invoice" variant="secondary" />
              )}
              {day.invoices.length === 0 && !canBill && <p>No invoice yet.</p>}
            </Card>
          )}

          {canManage && open && (
            <Card>
              <details>
                <summary className="cursor-pointer font-heading text-xl text-navy">Edit Tech Help Day</summary>
                <div className="mt-4">
                  {activeAppointments.length > 0 && (
                    <p className="mb-3 text-sm">
                      <Badge tone="warn">Residents booked</Badge> The date, time and session length cannot change while residents are booked.
                    </p>
                  )}
                  <ActionForm action={updateHelpDayAction}>
                    <input type="hidden" name="id" value={day.id} />
                    <HelpDayFields idPrefix="edit" technicians={technicians.map((t) => ({ id: t.id, name: t.displayName }))} day={day} tz={tz} withDate />
                    <SubmitButton size="sm">Save changes</SubmitButton>
                  </ActionForm>
                </div>
              </details>
            </Card>
          )}
          <p className="text-sm">Created {formatDateTime(day.createdAt, tz)}</p>
        </div>
      </div>
    </div>
  );
}
