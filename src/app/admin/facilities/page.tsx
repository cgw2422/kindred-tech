import Link from "next/link";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { formatDate, formatDateTime } from "@/lib/time";
import { Badge, ButtonLink, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { PartnershipBadge } from "./_components/badges";
import { SubmitButton } from "@/components/forms";
import { ActionForm } from "../_config/ActionForm";
import { RowAction } from "../_config/RowAction";
import {
  CONTACT_ROLE_LABELS,
  listFacilities,
  listInquiries,
  PARTNERSHIP_MODEL_LABELS,
  PARTNERSHIP_MODELS,
  PARTNERSHIP_STATUS_LABELS,
  PARTNERSHIP_STATUSES,
} from "@/lib/facilities/facilities";
import { convertInquiryAction, setInquiryStatusAction } from "./actions";

export const metadata: Metadata = { title: "Senior Living" };

export default async function FacilitiesPage({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string; model?: string; q?: string; closed?: string }> }) {
  const user = await requirePermission("facilities:view", "/admin/facilities");
  const sp = await searchParams;
  const tab = sp.tab === "inquiries" ? "inquiries" : "facilities";
  const canManage = can(user.role, "facilities:manage");
  const tz = (await getSettings("business")).timeZone;
  const [facilities, inquiries] = await Promise.all([
    tab === "facilities" ? listFacilities({ status: sp.status, model: sp.model, q: sp.q }) : Promise.resolve([]),
    listInquiries({ includeClosed: sp.closed === "1" }),
  ]);
  const openInquiries = sp.closed === "1" ? inquiries.filter((i) => i.status !== "CONVERTED" && i.status !== "CLOSED").length : inquiries.length;

  return (
    <div>
      <PageHeader
        eyebrow="Senior Living"
        title="Partner communities"
        description="Senior living communities, partnership agreements and website inquiries."
        actions={
          <>
            <ButtonLink href="/admin/help-days" variant="outline">
              Tech Help Days
            </ButtonLink>
            {canManage && <ButtonLink href="/admin/facilities/new">Add community</ButtonLink>}
          </>
        }
      />
      <nav aria-label="Senior living sections" className="mb-5 flex gap-2 border-b border-line">
        {[
          { key: "facilities", label: "Communities", href: "/admin/facilities" },
          { key: "inquiries", label: `Inquiries${openInquiries ? ` (${openInquiries})` : ""}`, href: "/admin/facilities?tab=inquiries" },
        ].map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={tab === t.key ? "page" : undefined}
            className={`-mb-px border-b-4 px-4 py-2 font-semibold no-underline ${tab === t.key ? "border-green text-navy" : "border-transparent text-body hover:text-navy"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "facilities" ? (
        <>
          <form method="get" className="mb-5 flex flex-wrap items-end gap-3" role="search">
            <div>
              <label htmlFor="q" className="mb-1 block text-sm font-semibold text-navy">
                Search
              </label>
              <input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Name or city" className="rounded-md border-2 border-line px-3 py-2" />
            </div>
            <div>
              <label htmlFor="status" className="mb-1 block text-sm font-semibold text-navy">
                Status
              </label>
              <select id="status" name="status" defaultValue={sp.status ?? ""} className="rounded-md border-2 border-line bg-white px-3 py-2">
                <option value="">All statuses</option>
                {PARTNERSHIP_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PARTNERSHIP_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="model" className="mb-1 block text-sm font-semibold text-navy">
                Model
              </label>
              <select id="model" name="model" defaultValue={sp.model ?? ""} className="rounded-md border-2 border-line bg-white px-3 py-2">
                <option value="">All models</option>
                {PARTNERSHIP_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {PARTNERSHIP_MODEL_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="rounded-md bg-navy px-4 py-2 font-semibold text-white">
              Filter
            </button>
            {(sp.status || sp.model || sp.q) && (
              <Link href="/admin/facilities" className="py-2 text-sm font-semibold">
                Clear
              </Link>
            )}
          </form>
          {facilities.length === 0 ? (
            <EmptyState title="No communities match">Add a community or convert a website inquiry.</EmptyState>
          ) : (
            <Table caption="Partner communities">
              <thead>
                <tr>
                  <Th>Community</Th>
                  <Th>Status</Th>
                  <Th>Model</Th>
                  <Th>Main contact</Th>
                  <Th>Next Tech Help Day</Th>
                  <Th className="text-right">Residents on file</Th>
                </tr>
              </thead>
              <tbody>
                {facilities.map((f) => (
                  <tr key={f.id}>
                    <Td>
                      <Link href={`/admin/facilities/${f.id}`} className="font-semibold">
                        {f.name}
                      </Link>
                      {f.city && <div className="text-sm">{f.city}</div>}
                    </Td>
                    <Td>
                      <PartnershipBadge status={f.partnershipStatus} />
                    </Td>
                    <Td>{f.partnershipModel ? PARTNERSHIP_MODEL_LABELS[f.partnershipModel] : "—"}</Td>
                    <Td>
                      {f.contacts[0] ? (
                        <>
                          {f.contacts[0].name}
                          <div className="text-sm">{CONTACT_ROLE_LABELS[f.contacts[0].role]}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      {f.techHelpDays[0] ? (
                        <Link href={`/admin/help-days/${f.techHelpDays[0].id}`}>{formatDate(f.techHelpDays[0].startsAt, tz, { weekday: "short", month: "short" })}</Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="text-right">{f._count.residents}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </>
      ) : (
        <>
          <p className="mb-4 text-sm">
            Partnership requests submitted from the website.{" "}
            {sp.closed === "1" ? <Link href="/admin/facilities?tab=inquiries">Hide converted and closed</Link> : <Link href="/admin/facilities?tab=inquiries&closed=1">Show converted and closed</Link>}
          </p>
          {inquiries.length === 0 ? (
            <EmptyState title="No inquiries">New partnership inquiries from the website will appear here.</EmptyState>
          ) : (
            <div className="space-y-4">
              {inquiries.map((i) => (
                <article key={i.id} className="rounded-lg border border-line bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg">{i.facilityName}</h2>
                      <p className="text-sm">
                        Received {formatDateTime(i.createdAt, tz)} · <Badge tone={i.status === "NEW" ? "warn" : i.status === "CONVERTED" ? "green" : "neutral"}>{i.status.toLowerCase()}</Badge>
                      </p>
                    </div>
                    {canManage && (
                      <div className="flex flex-wrap items-center gap-2">
                        {i.facilityId ? (
                          <ButtonLink href={`/admin/facilities/${i.facilityId}`} size="sm" variant="outline">
                            View community
                          </ButtonLink>
                        ) : (
                          <RowAction action={convertInquiryAction} id={i.id} label="Convert to facility" variant="primary" />
                        )}
                        {i.status !== "CONVERTED" && (
                          <ActionForm action={setInquiryStatusAction} inline className="inline-flex items-center gap-2">
                            <input type="hidden" name="id" value={i.id} />
                            <label htmlFor={`status-${i.id}`} className="sr-only">
                              Inquiry status
                            </label>
                            <select id={`status-${i.id}`} name="status" defaultValue={i.status} className="rounded-md border-2 border-line bg-white px-2 py-1 text-sm">
                              <option value="NEW">New</option>
                              <option value="CONTACTED">Contacted</option>
                              <option value="CLOSED">Closed</option>
                            </select>
                            <SubmitButton size="sm" variant="ghost">
                              Update
                            </SubmitButton>
                          </ActionForm>
                        )}
                      </div>
                    )}
                  </div>
                  <dl className="mt-3 grid gap-x-6 gap-y-1 text-[0.95rem] sm:grid-cols-2">
                    <div>
                      <dt className="inline font-semibold text-navy">Contact: </dt>
                      <dd className="inline">
                        {i.contactName}
                        {i.contactTitle ? `, ${i.contactTitle}` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold text-navy">Email: </dt>
                      <dd className="inline">
                        <a href={`mailto:${i.email}`}>{i.email}</a>
                      </dd>
                    </div>
                    {i.phone && (
                      <div>
                        <dt className="inline font-semibold text-navy">Phone: </dt>
                        <dd className="inline">{i.phone}</dd>
                      </div>
                    )}
                    {i.city && (
                      <div>
                        <dt className="inline font-semibold text-navy">City: </dt>
                        <dd className="inline">{i.city}</dd>
                      </div>
                    )}
                    {i.residentCount != null && (
                      <div>
                        <dt className="inline font-semibold text-navy">Residents: </dt>
                        <dd className="inline">{i.residentCount}</dd>
                      </div>
                    )}
                    {i.interest && (
                      <div>
                        <dt className="inline font-semibold text-navy">Interested in: </dt>
                        <dd className="inline">{i.interest}</dd>
                      </div>
                    )}
                  </dl>
                  {i.message && <p className="mt-3 whitespace-pre-line rounded-md bg-soft p-3">{i.message}</p>}
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
