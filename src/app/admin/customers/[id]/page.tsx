import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { Badge, ButtonLink, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { AppointmentStatusBadge, InvoiceStatusBadge, MembershipStatusBadge, PaymentStatusBadge, humanize } from "@/components/status";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/forms";
import { readFlash } from "@/lib/admin-helpers";
import { formatDate, formatDateTime } from "@/lib/time";
import { formatCents } from "@/lib/money";
import {
  addConsentAction,
  deleteAddressAction,
  deleteDeviceAction,
  deleteFamilyContactAction,
  logCommunicationAction,
  saveAddressAction,
  saveDeviceAction,
  saveFamilyContactAction,
  setMarketingConsentAction,
  updateCustomerAction,
  updateNotesAction,
} from "../actions";

export const metadata = { title: "Customer" };

const f = "block w-full rounded-md border-2 border-line px-3 py-2";
const l = "mb-1 block text-sm font-semibold text-navy";

function Section({ id, title, children, actions }: { id: string; title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <Card as="section" className="scroll-mt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-xl">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </Card>
  );
}

export default async function CustomerDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("customers:view", "/admin/customers");
  const { id } = await params;
  const flash = readFlash(await searchParams);
  const biz = await getSettings("business");
  const c = await prisma.customer.findUnique({
    where: { id },
    include: {
      addresses: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      familyContacts: { orderBy: { createdAt: "asc" } },
      devices: { orderBy: { createdAt: "asc" } },
      appointments: { orderBy: { startsAt: "desc" }, include: { service: true, technician: true, workOrder: true }, take: 100 },
      invoices: { orderBy: { createdAt: "desc" }, take: 50 },
      payments: { orderBy: { receivedAt: "desc" }, take: 50 },
      memberships: { include: { plan: true, purchaserContact: true }, orderBy: { createdAt: "desc" } },
      consents: { orderBy: { createdAt: "desc" }, include: { recordedBy: { select: { name: true } } } },
      communications: { orderBy: { createdAt: "desc" }, take: 30 },
      subscriptionReviews: { include: { items: true }, orderBy: { createdAt: "desc" } },
      supportRequests: { orderBy: { createdAt: "desc" }, take: 20 },
      facility: true,
      user: { select: { id: true, email: true, lastLoginAt: true } },
    },
  });
  if (!c) notFound();
  const manage = can(user.role, "customers:manage");
  const billing = can(user.role, "billing:view");
  const lifetime = c.payments.filter((p) => p.status === "SUCCEEDED" || p.status === "PARTIALLY_REFUNDED").reduce((s, p) => s + p.amountCents - p.refundedCents, 0);
  const completed = c.appointments.filter((a) => a.status === "COMPLETED").length;

  return (
    <div>
      <PageHeader
        eyebrow="Customer"
        title={`${c.firstName} ${c.lastName}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {c.preferredName && <span>Goes by {c.preferredName} ·</span>}
            <Badge tone={c.status === "ACTIVE" ? "green" : "neutral"}>{humanize(c.status)}</Badge>
            {c.memberships.some((m) => m.status === "ACTIVE") && <Badge tone="green">Kindred Care member</Badge>}
            {c.facility && <Badge tone="navy">Resident of {c.facility.name}</Badge>}
            {c.user && <Badge tone="navy">Portal account</Badge>}
          </span>
        }
        actions={manage ? <ButtonLink href={`/admin/appointments/new?customerId=${c.id}`}>New appointment</ButtonLink> : undefined}
      />
      <Flash flash={flash} />
      <nav aria-label="Customer sections" className="mb-4 flex flex-wrap gap-2 text-sm">
        {[
          ["contact", "Contact"],
          ["addresses", "Addresses"],
          ["family", "Authorized contacts"],
          ["devices", "Devices"],
          ["appointments", "Appointments"],
          ["billing", "Billing"],
          ["membership", "Membership"],
          ["consents", "Consent records"],
          ["communications", "Communications"],
          ["notes", "Technician notes"],
        ].map(([href, label]) => (
          <a key={href} href={`#${href}`} className="rounded-full border border-line bg-white px-3 py-1 no-underline">
            {label}
          </a>
        ))}
      </nav>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm font-semibold uppercase">Completed visits</p>
          <p className="font-heading text-3xl text-navy">{completed}</p>
        </Card>
        {billing && (
          <Card>
            <p className="text-sm font-semibold uppercase">Lifetime payments</p>
            <p className="font-heading text-3xl text-navy">{formatCents(lifetime)}</p>
          </Card>
        )}
        <Card>
          <p className="text-sm font-semibold uppercase">Customer since</p>
          <p className="font-heading text-xl text-navy">{formatDate(c.createdAt, biz.timeZone)}</p>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section id="contact" title="Contact information & preferences">
          <form action={updateCustomerAction} className="grid gap-3 md:grid-cols-2">
            <input type="hidden" name="id" value={c.id} />
            {(
              [
                ["firstName", "First name", c.firstName],
                ["lastName", "Last name", c.lastName],
                ["preferredName", "Preferred name", c.preferredName],
                ["phone", "Phone", c.phone],
                ["email", "Email", c.email],
                ["bestTimeToContact", "Best time to contact", c.bestTimeToContact],
                ["leadSource", "Lead source", c.leadSource],
              ] as const
            ).map(([name, label, value]) => (
              <div key={name}>
                <label htmlFor={`c-${name}`} className={l}>
                  {label}
                </label>
                <input id={`c-${name}`} name={name} defaultValue={value ?? ""} className={f} disabled={!manage} />
              </div>
            ))}
            <div>
              <label htmlFor="c-pref" className={l}>
                Contact preference
              </label>
              <select id="c-pref" name="contactPreference" defaultValue={c.contactPreference} className={f} disabled={!manage}>
                <option value="PHONE">Phone</option>
                <option value="EMAIL">Email</option>
                <option value="TEXT">Text</option>
                <option value="MAIL">Mail</option>
              </select>
            </div>
            <div>
              <label htmlFor="c-status" className={l}>
                Status
              </label>
              <select id="c-status" name="status" defaultValue={c.status} className={f} disabled={!manage}>
                <option value="ACTIVE">Active</option>
                <option value="LEAD">Lead</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
            {manage && (
              <div className="md:col-span-2">
                <SubmitButton size="sm">Save contact info</SubmitButton>
              </div>
            )}
          </form>
          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-2">
              <span className="font-semibold text-navy">Marketing email:</span> {c.marketingOptIn ? `Opted in ${c.marketingOptInAt ? formatDate(c.marketingOptInAt, biz.timeZone) : ""}` : "Not opted in"}
            </p>
            {manage && (
              <form action={setMarketingConsentAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="granted" value={c.marketingOptIn ? "0" : "1"} />
                <div>
                  <label htmlFor="mk-method" className={l}>
                    How obtained
                  </label>
                  <select id="mk-method" name="method" className={f}>
                    <option value="VERBAL">Verbal</option>
                    <option value="EMAIL">Email</option>
                    <option value="PAPER">Paper form</option>
                    <option value="WEB_FORM">Web form</option>
                  </select>
                </div>
                <SubmitButton size="sm" variant="outline">
                  {c.marketingOptIn ? "Record opt-out" : "Record opt-in"}
                </SubmitButton>
              </form>
            )}
            <p className="mt-2 text-sm">Transactional messages (confirmations, reminders, invoices) are sent regardless of marketing preference.</p>
          </div>
        </Section>

        <Section id="addresses" title="Service addresses">
          <ul className="mb-4 space-y-3">
            {c.addresses.map((a) => (
              <li key={a.id} className="rounded-md border border-line p-3">
                <details>
                  <summary className="cursor-pointer">
                    <span className="font-semibold">{a.label ?? "Address"}</span> {a.isPrimary && <Badge tone="green">Primary</Badge>} {a.line1}
                    {a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} {a.postalCode} {a.county && `(${a.county} County)`}
                  </summary>
                  {a.accessNotes && <p className="mt-1 text-sm">Access: {a.accessNotes}</p>}
                  {manage && (
                    <div className="mt-3 space-y-2">
                      <AddressForm customerId={c.id} address={a} />
                      <form action={deleteAddressAction}>
                        <input type="hidden" name="customerId" value={c.id} />
                        <input type="hidden" name="addressId" value={a.id} />
                        <SubmitButton size="sm" variant="ghost" confirm="Remove this address?">
                          Remove address
                        </SubmitButton>
                      </form>
                    </div>
                  )}
                </details>
              </li>
            ))}
          </ul>
          {manage && (
            <details>
              <summary className="cursor-pointer font-semibold text-navy">Add an address</summary>
              <div className="mt-3">
                <AddressForm customerId={c.id} />
              </div>
            </details>
          )}
        </Section>

        <Section id="family" title="Authorized family contacts">
          <p className="mb-3 text-sm">
            Permissions are granted by the customer. Paying or scheduling does not give access to private service details; only &quot;Can view service details&quot; does.
          </p>
          <ul className="mb-4 space-y-3">
            {c.familyContacts.map((fc) => (
              <li key={fc.id} className="rounded-md border border-line p-3">
                <details>
                  <summary className="cursor-pointer">
                    <span className="font-semibold">{fc.name}</span> {fc.relationship && `(${fc.relationship})`} {fc.isBillingContact && <Badge tone="navy">Billing contact</Badge>}{" "}
                    {fc.userId && <Badge tone="green">Portal access</Badge>}
                    <span className="block text-sm">
                      {[fc.phone, fc.email].filter(Boolean).join(" · ")} — can:{" "}
                      {[fc.canSchedule && "schedule", fc.canPay && "pay", fc.canReceiveUpdates && "receive updates", fc.canViewServiceDetails && "view service details"].filter(Boolean).join(", ") || "nothing yet"}
                    </span>
                  </summary>
                  {manage && (
                    <div className="mt-3 space-y-2">
                      <FamilyForm customerId={c.id} contact={fc} />
                      <form action={deleteFamilyContactAction}>
                        <input type="hidden" name="customerId" value={c.id} />
                        <input type="hidden" name="contactId" value={fc.id} />
                        <SubmitButton size="sm" variant="ghost" confirm="Remove this authorized contact?">
                          Remove contact
                        </SubmitButton>
                      </form>
                    </div>
                  )}
                </details>
              </li>
            ))}
          </ul>
          {manage && (
            <details>
              <summary className="cursor-pointer font-semibold text-navy">Add an authorized contact</summary>
              <div className="mt-3">
                <FamilyForm customerId={c.id} />
              </div>
            </details>
          )}
        </Section>

        <Section id="devices" title="Devices">
          {c.devices.length === 0 ? <p className="mb-3">No devices recorded.</p> : null}
          <ul className="mb-4 space-y-2">
            {c.devices.map((d) => (
              <li key={d.id} className="rounded-md border border-line p-3">
                <details>
                  <summary className="cursor-pointer">
                    <span className="font-semibold">{d.nickname ?? d.type}</span> {[d.make, d.model, d.os].filter(Boolean).join(" · ")}
                  </summary>
                  {d.notes && <p className="mt-1 text-sm">{d.notes}</p>}
                  {manage && (
                    <div className="mt-3 space-y-2">
                      <DeviceForm customerId={c.id} device={d} />
                      <form action={deleteDeviceAction}>
                        <input type="hidden" name="customerId" value={c.id} />
                        <input type="hidden" name="deviceId" value={d.id} />
                        <SubmitButton size="sm" variant="ghost" confirm="Remove this device?">
                          Remove device
                        </SubmitButton>
                      </form>
                    </div>
                  )}
                </details>
              </li>
            ))}
          </ul>
          {manage && (
            <details>
              <summary className="cursor-pointer font-semibold text-navy">Add a device</summary>
              <div className="mt-3">
                <DeviceForm customerId={c.id} />
              </div>
            </details>
          )}
          <p className="mt-3 text-sm">Do not record passwords here. Encourage customers to keep passwords in a secure password manager or a written book kept at home.</p>
        </Section>
      </div>

      <div className="mt-6 space-y-6">
        <Section id="appointments" title="Appointment & service history">
          {c.appointments.length === 0 ? (
            <p>No appointments yet.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Service</Th>
                  <Th>Technician</Th>
                  <Th>Status</Th>
                  <Th>Summary</Th>
                </tr>
              </thead>
              <tbody>
                {c.appointments.map((a) => (
                  <tr key={a.id}>
                    <Td>
                      <Link href={`/admin/appointments/${a.id}`}>{formatDateTime(a.startsAt, biz.timeZone)}</Link>
                    </Td>
                    <Td>{a.service.name}</Td>
                    <Td>{a.technician?.displayName ?? "—"}</Td>
                    <Td>
                      <AppointmentStatusBadge status={a.status} />
                    </Td>
                    <Td className="max-w-md">
                      {a.workOrder?.resolutionSummary ?? a.problemDescription ?? "—"}
                      {a.workOrder && (
                        <Link href={`/admin/work-orders/${a.workOrder.id}`} className="ml-2 text-sm">
                          Work order
                        </Link>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {c.subscriptionReviews.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-lg">Subscription reviews</h3>
              <ul className="space-y-1">
                {c.subscriptionReviews.map((r) => (
                  <li key={r.id}>
                    {formatDate(r.createdAt, biz.timeZone)}: {r.items.length} subscriptions reviewed, estimated monthly savings{" "}
                    {formatCents(r.items.reduce((s, i) => s + i.estimatedMonthlySavingsCents, 0))} (estimate, not guaranteed)
                    {r.items.some((i) => i.followUpNeeded) && <Badge tone="warn">Follow-up needed</Badge>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {c.supportRequests.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-lg">Support requests from portal</h3>
              <ul className="space-y-1">
                {c.supportRequests.map((r) => (
                  <li key={r.id}>
                    {formatDateTime(r.createdAt, biz.timeZone)} · <span className="font-semibold">{r.subject}</span> ({r.status.toLowerCase()}): {r.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        {billing && (
          <Section id="billing" title="Invoices & payments" actions={can(user.role, "billing:manage") ? <ButtonLink href={`/admin/invoices/new?customerId=${c.id}`} size="sm" variant="outline">New invoice</ButtonLink> : undefined}>
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-lg">Invoices</h3>
                {c.invoices.length === 0 ? (
                  <p>No invoices.</p>
                ) : (
                  <ul className="space-y-1">
                    {c.invoices.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/invoices/${i.id}`}>{i.number}</Link> {formatCents(i.totalCents)} <InvoiceStatusBadge status={i.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="mb-2 text-lg">Payment history</h3>
                {c.payments.length === 0 ? (
                  <p>No payments.</p>
                ) : (
                  <ul className="space-y-1">
                    {c.payments.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center gap-2">
                        {formatDate(p.receivedAt, biz.timeZone, { weekday: undefined, month: "short" })} {formatCents(p.amountCents)} {humanize(p.method)} <PaymentStatusBadge status={p.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <p className="mt-3 text-sm">Card details are handled by Stripe and are never stored here.</p>
          </Section>
        )}

        <Section id="membership" title="Kindred Care membership">
          {c.memberships.length === 0 ? (
            <p>
              No membership. {can(user.role, "memberships:manage") && <Link href={`/admin/memberships?customerId=${c.id}`}>Set up a membership</Link>}
            </p>
          ) : (
            <ul className="space-y-2">
              {c.memberships.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{m.plan.name}</span> <MembershipStatusBadge status={m.status} /> {formatCents(m.priceCents)}/{m.plan.interval.toLowerCase()}
                  {m.currentPeriodEnd && <span>· renews {formatDate(m.currentPeriodEnd, biz.timeZone)}</span>}
                  {m.purchaserContact && <span>· paid by {m.purchaserContact.name}</span>}
                  {can(user.role, "memberships:manage") && <Link href={`/admin/memberships/${m.id}`}>Manage</Link>}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="consents" title="Consent records">
          {c.consents.length === 0 ? (
            <p className="mb-3">No consent records.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Type</Th>
                  <Th>Granted</Th>
                  <Th>Method</Th>
                  <Th>By</Th>
                  <Th>Recorded by</Th>
                </tr>
              </thead>
              <tbody>
                {c.consents.map((k) => (
                  <tr key={k.id}>
                    <Td>{formatDateTime(k.createdAt, biz.timeZone)}</Td>
                    <Td>{humanize(k.type)}</Td>
                    <Td>{k.granted ? "Yes" : "Withdrawn"}</Td>
                    <Td>{humanize(k.method)}</Td>
                    <Td>{k.grantedByName ?? "—"}</Td>
                    <Td>{k.recordedBy?.name ?? "Online"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {manage && (
            <details className="mt-3">
              <summary className="cursor-pointer font-semibold text-navy">Record consent</summary>
              <form action={addConsentAction} className="mt-3 grid gap-3 md:grid-cols-2">
                <input type="hidden" name="id" value={c.id} />
                <div>
                  <label htmlFor="cs-type" className={l}>Type</label>
                  <select id="cs-type" name="type" className={f}>
                    {["SERVICE_AUTHORIZATION", "REMOTE_ACCESS", "SUBSCRIPTION_CHANGES", "FAMILY_INFORMATION_SHARING", "MARKETING_EMAIL", "TERMS_ACCEPTED", "OTHER"].map((t) => (
                      <option key={t} value={t}>{humanize(t)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="cs-method" className={l}>Method</label>
                  <select id="cs-method" name="method" className={f}>
                    {["VERBAL", "SIGNATURE", "PAPER", "EMAIL", "WEB_FORM"].map((t) => (
                      <option key={t} value={t}>{humanize(t)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="cs-granted" className={l}>Granted?</label>
                  <select id="cs-granted" name="granted" className={f}>
                    <option value="1">Granted</option>
                    <option value="0">Withdrawn / declined</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="cs-by" className={l}>Given by (name)</label>
                  <input id="cs-by" name="grantedByName" className={f} />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="cs-notes" className={l}>Notes</label>
                  <input id="cs-notes" name="notes" className={f} />
                </div>
                <div>
                  <SubmitButton size="sm">Save consent record</SubmitButton>
                </div>
              </form>
            </details>
          )}
        </Section>

        <Section id="communications" title="Communication history">
          {c.communications.length === 0 ? (
            <p className="mb-3">No communications yet.</p>
          ) : (
            <ul className="mb-4 space-y-2">
              {c.communications.map((m) => (
                <li key={m.id} className="border-b border-line pb-2">
                  <span className="font-semibold">{formatDateTime(m.createdAt, biz.timeZone)}</span> · {humanize(m.channel)} {m.direction === "INBOUND" ? "(inbound)" : ""} · {m.subject ?? m.templateKey ?? ""} ·{" "}
                  <span className="text-sm">{humanize(m.status)}{m.statusReason ? `: ${m.statusReason}` : ""}</span>
                  {m.channel !== "EMAIL" && m.bodyPreview && <p className="text-sm">{m.bodyPreview}</p>}
                </li>
              ))}
            </ul>
          )}
          {manage && (
            <details>
              <summary className="cursor-pointer font-semibold text-navy">Log a call or note</summary>
              <form action={logCommunicationAction} className="mt-3 grid gap-3 md:grid-cols-3">
                <input type="hidden" name="customerId" value={c.id} />
                <div>
                  <label htmlFor="lc-ch" className={l}>Type</label>
                  <select id="lc-ch" name="channel" className={f}>
                    <option value="PHONE">Phone call</option>
                    <option value="IN_PERSON">In person</option>
                    <option value="NOTE">Note</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="lc-dir" className={l}>Direction</label>
                  <select id="lc-dir" name="direction" className={f}>
                    <option value="OUTBOUND">We contacted them</option>
                    <option value="INBOUND">They contacted us</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="lc-subj" className={l}>Subject</label>
                  <input id="lc-subj" name="subject" className={f} />
                </div>
                <div className="md:col-span-3">
                  <label htmlFor="lc-sum" className={l}>Summary</label>
                  <textarea id="lc-sum" name="summary" rows={3} className={f} required />
                </div>
                <div>
                  <SubmitButton size="sm">Log communication</SubmitButton>
                </div>
              </form>
            </details>
          )}
        </Section>

        <Section id="notes" title="Technician & internal notes">
          <form action={updateNotesAction}>
            <input type="hidden" name="id" value={c.id} />
            <label htmlFor="internalNotes" className="sr-only">
              Internal notes
            </label>
            <textarea id="internalNotes" name="internalNotes" rows={6} defaultValue={c.internalNotes ?? ""} className={`${f} mb-3`} disabled={!manage} />
            <p className="mb-3 text-sm">Internal only. Never record passwords, banking details, or medical information.</p>
            {manage && <SubmitButton size="sm">Save notes</SubmitButton>}
          </form>
          {c.appointments.some((a) => a.workOrder?.troubleshootingNotes) && (
            <div className="mt-4">
              <h3 className="mb-2 text-lg">Notes from visits</h3>
              <ul className="space-y-2">
                {c.appointments
                  .filter((a) => a.workOrder?.troubleshootingNotes)
                  .map((a) => (
                    <li key={a.id}>
                      <span className="font-semibold">{formatDate(a.startsAt, biz.timeZone)}</span> ({a.technician?.displayName}): <span className="whitespace-pre-wrap">{a.workOrder!.troubleshootingNotes}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function AddressForm({ customerId, address }: { customerId: string; address?: { id: string; label: string | null; line1: string; line2: string | null; city: string; state: string; postalCode: string; accessNotes: string | null; isPrimary: boolean } }) {
  const p = address?.id ?? "new";
  return (
    <form action={saveAddressAction} className="grid gap-2 md:grid-cols-2">
      <input type="hidden" name="customerId" value={customerId} />
      {address && <input type="hidden" name="addressId" value={address.id} />}
      <div>
        <label htmlFor={`ad-label-${p}`} className={l}>Label</label>
        <input id={`ad-label-${p}`} name="label" defaultValue={address?.label ?? ""} placeholder="Home, Lake house..." className={f} />
      </div>
      <div>
        <label htmlFor={`ad-l1-${p}`} className={l}>Street</label>
        <input id={`ad-l1-${p}`} name="line1" defaultValue={address?.line1 ?? ""} required className={f} />
      </div>
      <div>
        <label htmlFor={`ad-l2-${p}`} className={l}>Apt / unit</label>
        <input id={`ad-l2-${p}`} name="line2" defaultValue={address?.line2 ?? ""} className={f} />
      </div>
      <div>
        <label htmlFor={`ad-city-${p}`} className={l}>City</label>
        <input id={`ad-city-${p}`} name="city" defaultValue={address?.city ?? ""} required className={f} />
      </div>
      <div>
        <label htmlFor={`ad-st-${p}`} className={l}>State</label>
        <input id={`ad-st-${p}`} name="state" defaultValue={address?.state ?? "OH"} maxLength={2} className={f} />
      </div>
      <div>
        <label htmlFor={`ad-zip-${p}`} className={l}>ZIP</label>
        <input id={`ad-zip-${p}`} name="postalCode" defaultValue={address?.postalCode ?? ""} required className={f} />
      </div>
      <div className="md:col-span-2">
        <label htmlFor={`ad-acc-${p}`} className={l}>Access notes</label>
        <input id={`ad-acc-${p}`} name="accessNotes" defaultValue={address?.accessNotes ?? ""} className={f} />
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="isPrimary" defaultChecked={address?.isPrimary} className="h-5 w-5" /> Primary address
      </label>
      <div>
        <SubmitButton size="sm">Save address</SubmitButton>
      </div>
    </form>
  );
}

function FamilyForm({
  customerId,
  contact,
}: {
  customerId: string;
  contact?: { id: string; name: string; relationship: string | null; email: string | null; phone: string | null; canSchedule: boolean; canPay: boolean; canReceiveUpdates: boolean; canViewServiceDetails: boolean; isBillingContact: boolean; notes: string | null };
}) {
  const p = contact?.id ?? "new";
  return (
    <form action={saveFamilyContactAction} className="grid gap-2 md:grid-cols-2">
      <input type="hidden" name="customerId" value={customerId} />
      {contact && <input type="hidden" name="contactId" value={contact.id} />}
      {(
        [
          ["name", "Name", contact?.name],
          ["relationship", "Relationship", contact?.relationship],
          ["email", "Email", contact?.email],
          ["phone", "Phone", contact?.phone],
        ] as const
      ).map(([n, label, v]) => (
        <div key={n}>
          <label htmlFor={`fc-${n}-${p}`} className={l}>{label}</label>
          <input id={`fc-${n}-${p}`} name={n} defaultValue={v ?? ""} required={n === "name"} className={f} />
        </div>
      ))}
      <fieldset className="md:col-span-2">
        <legend className={l}>Permissions granted by the customer</legend>
        {(
          [
            ["canSchedule", "Can schedule appointments", contact?.canSchedule],
            ["canPay", "Can pay invoices / memberships", contact?.canPay],
            ["isBillingContact", "Default billing contact (requires can pay)", contact?.isBillingContact],
            ["canReceiveUpdates", "Receives appointment updates", contact?.canReceiveUpdates],
            ["canViewServiceDetails", "Can view private service details (notes, devices)", contact?.canViewServiceDetails],
          ] as const
        ).map(([n, label, v]) => (
          <label key={n} className="flex items-center gap-2">
            <input type="checkbox" name={n} defaultChecked={v} className="h-5 w-5" /> {label}
          </label>
        ))}
      </fieldset>
      <div>
        <label htmlFor={`fc-auth-${p}`} className={l}>Authorized by (customer name, required for service details)</label>
        <input id={`fc-auth-${p}`} name="authorizedBy" className={f} />
      </div>
      <div>
        <label htmlFor={`fc-notes-${p}`} className={l}>Notes</label>
        <input id={`fc-notes-${p}`} name="notes" defaultValue={contact?.notes ?? ""} className={f} />
      </div>
      <div>
        <SubmitButton size="sm">Save contact</SubmitButton>
      </div>
    </form>
  );
}

function DeviceForm({ customerId, device }: { customerId: string; device?: { id: string; type: string; make: string | null; model: string | null; os: string | null; nickname: string | null; notes: string | null } }) {
  const p = device?.id ?? "new";
  return (
    <form action={saveDeviceAction} className="grid gap-2 md:grid-cols-3">
      <input type="hidden" name="customerId" value={customerId} />
      {device && <input type="hidden" name="deviceId" value={device.id} />}
      {(
        [
          ["type", "Type (phone, tablet, laptop...)", device?.type],
          ["make", "Make", device?.make],
          ["model", "Model", device?.model],
          ["os", "Operating system", device?.os],
          ["nickname", "Nickname", device?.nickname],
          ["notes", "Notes", device?.notes],
        ] as const
      ).map(([n, label, v]) => (
        <div key={n}>
          <label htmlFor={`dv-${n}-${p}`} className={l}>{label}</label>
          <input id={`dv-${n}-${p}`} name={n} defaultValue={v ?? ""} required={n === "type"} className={f} />
        </div>
      ))}
      <div>
        <SubmitButton size="sm">Save device</SubmitButton>
      </div>
    </form>
  );
}
