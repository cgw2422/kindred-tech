import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { formatCents } from "@/lib/money";
import { formatDate, formatDateTime, formatTime, toDateKey } from "@/lib/time";
import { Badge, ButtonLink, Card, DefinitionList, EmptyState, PageHeader, SectionTitle, Stat, Table, Td, Th } from "@/components/ui";
import { InvoiceStatusBadge, humanize } from "@/components/status";
import { SubmitButton } from "@/components/forms";
import { ActionForm } from "../../_config/ActionForm";
import { RowAction } from "../../_config/RowAction";
import { CONTACT_ROLE_LABELS, PARTNERSHIP_MODEL_LABELS, SESSION_REQUEST_STATUSES } from "@/lib/facilities/facilities";
import { HELP_DAY_PAYMENT_LABELS } from "@/lib/facilities/help-days";
import { getFacilityUsage } from "@/lib/facilities/usage";
import { FacilityFields } from "../_components/FacilityFields";
import { ContactFields } from "../_components/ContactFields";
import { AgreementFields } from "../_components/AgreementFields";
import { HelpDayStatusBadge, PartnershipBadge } from "../_components/badges";
import { FTextArea } from "../_components/fields";
import {
  addContactAction,
  createContractInvoiceAction,
  deleteAgreementAction,
  inviteContactAction,
  removeContactAction,
  saveAgreementAction,
  setPortalAccessAction,
  setSessionRequestStatusAction,
  updateContactAction,
  updateFacilityAction,
  updateFacilityNotesAction,
} from "../actions";

export const metadata: Metadata = { title: "Community" };

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "contacts", label: "Contacts" },
  { key: "agreements", label: "Agreements" },
  { key: "help-days", label: "Tech Help Days" },
  { key: "residents", label: "Residents" },
  { key: "invoices", label: "Invoices" },
  { key: "requests", label: "Session requests" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function FacilityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const user = await requirePermission("facilities:view", `/admin/facilities/${id}`);
  const sp = await searchParams;
  const tab: TabKey = (TABS.find((t) => t.key === sp.tab)?.key ?? "overview") as TabKey;
  const canManage = can(user.role, "facilities:manage");
  const canBill = can(user.role, "billing:manage");
  const tz = (await getSettings("business")).timeZone;
  const now = new Date();

  const facility = await prisma.facility.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: { createdAt: "asc" }, include: { user: { select: { id: true, email: true, lastLoginAt: true, isActive: true } } } },
      agreements: { orderBy: [{ status: "asc" }, { createdAt: "desc" }] },
      _count: { select: { residents: true, sessionRequests: { where: { status: "OPEN" } } } },
    },
  });
  if (!facility) notFound();

  const openRequests = facility._count.sessionRequests;
  const tabLabel = (t: (typeof TABS)[number]) => (t.key === "requests" && openRequests ? `${t.label} (${openRequests})` : t.key === "residents" ? `${t.label} (${facility._count.residents})` : t.label);

  return (
    <div>
      <p className="mb-2 text-sm">
        <Link href="/admin/facilities">← Partner communities</Link>
      </p>
      <PageHeader
        eyebrow="Senior Living"
        title={facility.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <PartnershipBadge status={facility.partnershipStatus} />
            {facility.partnershipModel && <Badge tone="navy">{PARTNERSHIP_MODEL_LABELS[facility.partnershipModel]}</Badge>}
            {[facility.city, facility.state].filter(Boolean).join(", ")}
          </span>
        }
        actions={canManage ? <ButtonLink href={`/admin/help-days?facilityId=${facility.id}#create`}>Schedule Tech Help Day</ButtonLink> : undefined}
      />
      <nav aria-label="Community sections" className="mb-6 flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/facilities/${facility.id}${t.key === "overview" ? "" : `?tab=${t.key}`}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={`-mb-px border-b-4 px-3 py-2 font-semibold no-underline ${tab === t.key ? "border-green text-navy" : "border-transparent text-body hover:text-navy"}`}
          >
            {tabLabel(t)}
          </Link>
        ))}
      </nav>

      {tab === "overview" && <OverviewTab facility={facility} canManage={canManage} tz={tz} now={now} />}
      {tab === "contacts" && <ContactsTab facility={facility} canManage={canManage} tz={tz} />}
      {tab === "agreements" && <AgreementsTab facility={facility} canManage={canManage} canBill={canBill} tz={tz} now={now} />}
      {tab === "help-days" && <HelpDaysTab facilityId={facility.id} tz={tz} now={now} />}
      {tab === "residents" && <ResidentsTab facilityId={facility.id} />}
      {tab === "invoices" && <InvoicesTab facilityId={facility.id} tz={tz} />}
      {tab === "requests" && <RequestsTab facilityId={facility.id} canManage={canManage} tz={tz} />}
    </div>
  );
}

type FacilityWithRelations = Prisma.FacilityGetPayload<{
  include: {
    contacts: { include: { user: { select: { id: true; email: true; lastLoginAt: true; isActive: true } } } };
    agreements: true;
    _count: { select: { residents: true; sessionRequests: true } };
  };
}>;

async function OverviewTab({ facility, canManage, tz, now }: { facility: FacilityWithRelations; canManage: boolean; tz: string; now: Date }) {
  const usage = await getFacilityUsage(facility.id, { months: 6, now });
  const active = facility.agreements.find((a) => a.status === "ACTIVE");
  return (
    <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Help days held" value={usage.totals.helpDaysHeld} hint={`${usage.totals.upcomingHelpDays} upcoming`} />
          <Stat label="Sessions completed" value={usage.totals.sessionsCompleted} />
          <Stat label="Residents served" value={usage.totals.residentsServed} />
          <Stat label="Service hours" value={usage.totals.serviceHours} />
        </div>
        <Card>
          <SectionTitle>Community details</SectionTitle>
          {canManage ? (
            <ActionForm action={updateFacilityAction}>
              <input type="hidden" name="id" value={facility.id} />
              <FacilityFields facility={facility} />
              <SubmitButton>Save details</SubmitButton>
            </ActionForm>
          ) : (
            <DefinitionList
              items={[
                ["Type", humanize(facility.type)],
                ["Address", [facility.line1, facility.line2, facility.city, facility.state, facility.postalCode].filter(Boolean).join(", ") || "—"],
                ["Phone", facility.phone],
                ["Email", facility.email],
                ["Resident rate", facility.residentRateCents != null ? formatCents(facility.residentRateCents) : "Standard price"],
                ["Residents", facility.residentCount ?? "—"],
              ]}
            />
          )}
        </Card>
      </div>
      <div className="space-y-6">
        <Card>
          <SectionTitle>Agreement in force</SectionTitle>
          {active ? (
            <DefinitionList
              items={[
                ["Model", PARTNERSHIP_MODEL_LABELS[active.model]],
                ["Started", active.startDate ? formatDate(active.startDate, tz) : "—"],
                ["Renews", active.renewalDate ? formatDate(active.renewalDate, tz) : "—"],
                ["Monthly fee", formatCents(active.monthlyFeeCents)],
              ]}
            />
          ) : (
            <p>No active agreement.</p>
          )}
          <p className="mt-3 text-sm">
            <Link href={`/admin/facilities/${facility.id}?tab=agreements`}>Manage agreements</Link>
          </p>
        </Card>
        <Card>
          <SectionTitle>Internal notes</SectionTitle>
          <p className="mb-3 text-sm">Staff only. Never shown to the community or residents.</p>
          {canManage ? (
            <ActionForm action={updateFacilityNotesAction}>
              <input type="hidden" name="id" value={facility.id} />
              <FTextArea id="facility-notes" label="Notes" name="internalNotes" rows={8} defaultValue={facility.internalNotes ?? ""} />
              <SubmitButton size="sm">Save notes</SubmitButton>
            </ActionForm>
          ) : (
            <p className="whitespace-pre-line">{facility.internalNotes || "—"}</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function ContactsTab({ facility, canManage, tz }: { facility: FacilityWithRelations; canManage: boolean; tz: string }) {
  return (
    <div className="space-y-6">
      <p className="max-w-3xl">
        Contacts with portal access can sign in at <code>/login</code> (using the email-link option) to see their Tech Help Day schedule, agreement, invoices and overall usage. They never see
        individual residents&apos; names, contact details or what residents needed help with.
      </p>
      {facility.contacts.length === 0 && <EmptyState title="No contacts yet">Add the Activities Director or Executive Director below.</EmptyState>}
      {facility.contacts.map((c) => (
        <Card key={c.id}>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg">{c.name}</h2>
              <p className="text-sm">
                {CONTACT_ROLE_LABELS[c.role]}
                {c.title ? ` · ${c.title}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {c.portalAccess ? <Badge tone="green">Portal access on</Badge> : <Badge>No portal access</Badge>}
              {c.user && (
                <span className="text-sm">
                  Login: {c.user.email}
                  {c.user.lastLoginAt ? ` · last sign-in ${formatDateTime(c.user.lastLoginAt, tz)}` : " · never signed in"}
                </span>
              )}
            </div>
          </div>
          {canManage ? (
            <>
              <details className="mb-3">
                <summary className="cursor-pointer font-semibold text-navy">Edit contact</summary>
                <div className="mt-3">
                  <ActionForm action={updateContactAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <ContactFields contact={c} idPrefix={`c-${c.id}`} />
                    <SubmitButton size="sm">Save contact</SubmitButton>
                  </ActionForm>
                </div>
              </details>
              <div className="flex flex-wrap items-center gap-3">
                <RowAction
                  action={inviteContactAction}
                  id={c.id}
                  label={c.userId ? "Resend portal invitation" : "Invite to portal"}
                  variant="primary"
                  confirm={c.email ? `Email a portal sign-in link to ${c.email}?` : undefined}
                />
                {c.userId &&
                  (c.portalAccess ? (
                    <RowAction action={setPortalAccessAction} id={c.id} label="Turn off portal access" extra={{ enable: "0" }} confirm="Turn off portal access for this contact?" />
                  ) : (
                    <RowAction action={setPortalAccessAction} id={c.id} label="Turn on portal access" extra={{ enable: "1" }} />
                  ))}
                <RowAction action={removeContactAction} id={c.id} label="Remove" variant="ghost" confirm={`Remove ${c.name} from this community?`} />
              </div>
            </>
          ) : (
            <DefinitionList items={[["Email", c.email], ["Phone", c.phone]]} />
          )}
        </Card>
      ))}
      {canManage && (
        <Card>
          <SectionTitle>Add a contact</SectionTitle>
          <ActionForm action={addContactAction} resetOnSuccess>
            <input type="hidden" name="facilityId" value={facility.id} />
            <ContactFields idPrefix="new-contact" />
            <SubmitButton>Add contact</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}

function AgreementsTab({ facility, canManage, canBill, tz, now }: { facility: FacilityWithRelations; canManage: boolean; canBill: boolean; tz: string; now: Date }) {
  const thisMonth = toDateKey(now, tz).slice(0, 7);
  return (
    <div className="space-y-6">
      {facility.agreements.length === 0 && <EmptyState title="No agreements yet" />}
      {facility.agreements.map((a) => (
        <Card key={a.id}>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg">{PARTNERSHIP_MODEL_LABELS[a.model]}</h2>
              <p className="text-sm">
                {a.startDate ? formatDate(a.startDate, tz) : "No start date"}
                {a.endDate ? ` to ${formatDate(a.endDate, tz)}` : ""}
                {a.renewalDate ? ` · renews ${formatDate(a.renewalDate, tz)}${a.autoRenew ? " (automatic)" : ""}` : ""}
              </p>
            </div>
            <Badge tone={a.status === "ACTIVE" ? "green" : a.status === "DRAFT" ? "warn" : "neutral"}>{humanize(a.status)}</Badge>
          </div>
          <DefinitionList
            items={[
              ["Monthly fee", formatCents(a.monthlyFeeCents)],
              ["Session rate", formatCents(a.sessionRateCents)],
              ["Resident rate", formatCents(a.residentRateCents)],
              ["Hours per month", a.hoursPerMonth ?? "—"],
            ]}
          />
          {a.terms && <p className="mt-3 whitespace-pre-line rounded-md bg-soft p-3 text-[0.95rem]">{a.terms}</p>}
          {canManage && (
            <>
              {a.model === "RECURRING_CONTRACT" && a.status === "ACTIVE" && a.monthlyFeeCents && canBill && (
                <ActionForm action={createContractInvoiceAction} className="mt-4 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="id" value={a.id} />
                  <div>
                    <label htmlFor={`month-${a.id}`} className="mb-1 block text-sm font-semibold text-navy">
                      Monthly invoice for
                    </label>
                    <input id={`month-${a.id}`} name="month" type="month" defaultValue={thisMonth} className="rounded-md border-2 border-line px-3 py-2" />
                  </div>
                  <SubmitButton size="sm" variant="secondary" pendingText="Creating...">
                    Create monthly invoice
                  </SubmitButton>
                  <p className="w-full text-sm">Creates a draft invoice once per month; running it again for the same month shows the existing invoice.</p>
                </ActionForm>
              )}
              <details className="mt-4">
                <summary className="cursor-pointer font-semibold text-navy">Edit agreement</summary>
                <div className="mt-3">
                  <ActionForm action={saveAgreementAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="facilityId" value={facility.id} />
                    <AgreementFields agreement={a} tz={tz} idPrefix={`a-${a.id}`} />
                    <SubmitButton size="sm">Save agreement</SubmitButton>
                  </ActionForm>
                  {a.status === "DRAFT" && (
                    <div className="mt-3">
                      <RowAction action={deleteAgreementAction} id={a.id} label="Delete draft" variant="ghost" confirm="Delete this draft agreement?" />
                    </div>
                  )}
                </div>
              </details>
            </>
          )}
        </Card>
      ))}
      {canManage && (
        <Card>
          <SectionTitle>New agreement</SectionTitle>
          <ActionForm action={saveAgreementAction} resetOnSuccess>
            <input type="hidden" name="facilityId" value={facility.id} />
            <AgreementFields tz={tz} idPrefix="new-agreement" />
            <SubmitButton>Add agreement</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}

async function HelpDaysTab({ facilityId, tz, now }: { facilityId: string; tz: string; now: Date }) {
  const days = await prisma.techHelpDay.findMany({
    where: { facilityId },
    orderBy: { startsAt: "desc" },
    take: 100,
    include: { technician: { select: { displayName: true } }, _count: { select: { appointments: { where: { status: { notIn: ["CANCELED", "NO_SHOW"] } } } } } },
  });
  const upcoming = days.filter((d) => d.endsAt >= now).reverse();
  const past = days.filter((d) => d.endsAt < now);
  const table = (rows: typeof days, caption: string) => (
    <Table caption={caption}>
      <thead>
        <tr>
          <Th>Date</Th>
          <Th>Time</Th>
          <Th>Status</Th>
          <Th>Payment</Th>
          <Th>Technician</Th>
          <Th className="text-right">Booked</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((d) => (
          <tr key={d.id}>
            <Td>
              <Link href={`/admin/help-days/${d.id}`} className="font-semibold">
                {formatDate(d.startsAt, tz, { weekday: "short", month: "short" })}
              </Link>
            </Td>
            <Td>
              {formatTime(d.startsAt, tz)}–{formatTime(d.endsAt, tz)}
            </Td>
            <Td>
              <HelpDayStatusBadge status={d.status} />
            </Td>
            <Td>{HELP_DAY_PAYMENT_LABELS[d.paymentModel]}</Td>
            <Td>{d.technician?.displayName ?? "Unassigned"}</Td>
            <Td className="text-right">{d._count.appointments}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ButtonLink href={`/admin/help-days?facilityId=${facilityId}#create`} size="sm">
          Schedule Tech Help Day
        </ButtonLink>
      </div>
      <section>
        <SectionTitle>Upcoming</SectionTitle>
        {upcoming.length ? table(upcoming, "Upcoming Tech Help Days") : <EmptyState title="Nothing scheduled" />}
      </section>
      <section>
        <SectionTitle>Past</SectionTitle>
        {past.length ? table(past, "Past Tech Help Days") : <p>None yet.</p>}
      </section>
    </div>
  );
}

async function ResidentsTab({ facilityId }: { facilityId: string }) {
  const residents = await prisma.customer.findMany({
    where: { facilityId },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 500,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      facilityUnit: true,
      phone: true,
      email: true,
      _count: { select: { appointments: { where: { facilityId, status: { notIn: ["CANCELED", "NO_SHOW"] } } } } },
    },
  });
  return (
    <div>
      <p className="mb-4 max-w-3xl text-sm">Residents are visible to Kindred staff only. The community&apos;s portal shows totals, never names.</p>
      {residents.length === 0 ? (
        <EmptyState title="No residents on file">Residents are added when they sign up for a Tech Help Day.</EmptyState>
      ) : (
        <Table caption="Residents">
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Unit</Th>
              <Th>Phone</Th>
              <Th>Email</Th>
              <Th className="text-right">Sessions</Th>
            </tr>
          </thead>
          <tbody>
            {residents.map((r) => (
              <tr key={r.id}>
                <Td>
                  <Link href={`/admin/customers/${r.id}`} className="font-semibold">
                    {r.lastName}, {r.firstName}
                  </Link>
                </Td>
                <Td>{r.facilityUnit ?? "—"}</Td>
                <Td>{r.phone ?? "—"}</Td>
                <Td>{r.email ?? "—"}</Td>
                <Td className="text-right">{r._count.appointments}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

async function InvoicesTab({ facilityId, tz }: { facilityId: string; tz: string }) {
  const invoices = await prisma.invoice.findMany({ where: { facilityId }, orderBy: { createdAt: "desc" }, take: 200 });
  return invoices.length === 0 ? (
    <EmptyState title="No invoices yet">Sponsored Tech Help Day and monthly contract invoices appear here.</EmptyState>
  ) : (
    <Table caption="Community invoices">
      <thead>
        <tr>
          <Th>Number</Th>
          <Th>Created</Th>
          <Th>Due</Th>
          <Th>Status</Th>
          <Th className="text-right">Total</Th>
          <Th className="text-right">Paid</Th>
        </tr>
      </thead>
      <tbody>
        {invoices.map((i) => (
          <tr key={i.id}>
            <Td>
              <Link href={`/admin/invoices/${i.id}`} className="font-semibold">
                {i.number}
              </Link>
            </Td>
            <Td>{formatDate(i.createdAt, tz, { weekday: undefined, month: "short" })}</Td>
            <Td>{i.dueAt ? formatDate(i.dueAt, tz, { weekday: undefined, month: "short" }) : "—"}</Td>
            <Td>
              <InvoiceStatusBadge status={i.status} />
            </Td>
            <Td className="text-right">{formatCents(i.totalCents)}</Td>
            <Td className="text-right">{formatCents(i.amountPaidCents)}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

async function RequestsTab({ facilityId, canManage, tz }: { facilityId: string; canManage: boolean; tz: string }) {
  const requests = await prisma.facilitySessionRequest.findMany({ where: { facilityId }, orderBy: { createdAt: "desc" }, take: 100 });
  if (requests.length === 0) return <EmptyState title="No session requests">Requests made from the community portal appear here.</EmptyState>;
  return (
    <div className="space-y-4">
      {requests.map((r) => (
        <Card key={r.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-navy">Requested by {r.requestedByName}</p>
              <p className="text-sm">{formatDateTime(r.createdAt, tz)}</p>
            </div>
            <Badge tone={r.status === "OPEN" ? "warn" : r.status === "SCHEDULED" ? "green" : "neutral"}>{humanize(r.status)}</Badge>
          </div>
          <p className="mt-3">
            <span className="font-semibold text-navy">Preferred dates: </span>
            {r.preferredDates}
          </p>
          {r.notes && <p className="mt-2 whitespace-pre-line">{r.notes}</p>}
          {canManage && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <ActionForm action={setSessionRequestStatusAction} inline className="inline-flex items-center gap-2">
                <input type="hidden" name="id" value={r.id} />
                <label htmlFor={`req-${r.id}`} className="text-sm font-semibold text-navy">
                  Status
                </label>
                <select id={`req-${r.id}`} name="status" defaultValue={r.status} className="rounded-md border-2 border-line bg-white px-2 py-1 text-sm">
                  {SESSION_REQUEST_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {humanize(s)}
                    </option>
                  ))}
                </select>
                <SubmitButton size="sm" variant="ghost">
                  Update
                </SubmitButton>
              </ActionForm>
              <ButtonLink href={`/admin/help-days?facilityId=${facilityId}#create`} size="sm" variant="outline">
                Schedule a Tech Help Day
              </ButtonLink>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
