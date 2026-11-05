import Link from "next/link";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { fd } from "@/lib/forms";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { formatDateTime } from "@/lib/time";
import { communityMessageWhere, residentialMessageWhere } from "@/lib/leads";
import { communityTypeLabel, visitFrequencyLabel } from "@/lib/community";

export const metadata = { title: "Messages & Leads" };

async function setMessageStatus(formData: FormData) {
  "use server";
  const user = await requirePermission("customers:manage");
  const id = fd(formData, "id");
  const status = ["NEW", "IN_PROGRESS", "DONE", "SPAM"].includes(fd(formData, "status")) ? fd(formData, "status") : "DONE";
  await prisma.contactMessage.update({ where: { id }, data: { status } });
  await audit({ actorUserId: user.id, action: "lead.status_changed", entityType: "ContactMessage", entityId: id, metadata: { status } });
  revalidatePath("/admin/leads");
}

async function convertToCustomer(formData: FormData) {
  "use server";
  const user = await requirePermission("customers:manage");
  const m = await prisma.contactMessage.findUniqueOrThrow({ where: { id: fd(formData, "id") } });
  const [first, ...rest] = m.name.trim().split(/\s+/);
  const c = await prisma.customer.create({
    data: { firstName: first || m.name, lastName: rest.join(" ") || "(unknown)", email: m.email, phone: m.phone, status: "LEAD", leadSource: `Contact form${m.topic ? `: ${m.topic}` : ""}`, internalNotes: `From contact form: ${m.message.slice(0, 2000)}` },
  });
  await prisma.contactMessage.update({ where: { id: m.id }, data: { status: "IN_PROGRESS" } });
  await audit({ actorUserId: user.id, action: "lead.converted", entityType: "Customer", entityId: c.id });
  const { redirect } = await import("next/navigation");
  redirect(`/admin/customers/${c.id}`);
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requirePermission("customers:view", "/admin/leads");
  const show = (await searchParams).show === "all" ? "all" : "open";
  const biz = await getSettings("business");
  const openFilter = show === "all" ? {} : { status: { in: ["NEW", "IN_PROGRESS"] } };
  const [messages, communityMessages, inquiries] = await Promise.all([
    prisma.contactMessage.findMany({ where: { ...openFilter, ...residentialMessageWhere }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.contactMessage.findMany({ where: { ...openFilter, ...communityMessageWhere }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.facilityInquiry.findMany({ where: show === "all" ? {} : { status: { in: ["NEW", "CONTACTED"] } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return (
    <div>
      <PageHeader
        title="Messages & leads"
        description="Residential and general contact messages are kept separate from senior living community leads."
        actions={
          <Link href={`/admin/leads?show=${show === "all" ? "open" : "all"}`} className="font-semibold">
            {show === "all" ? "Show open only" : "Show all"}
          </Link>
        }
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 id="residential" className="mb-1 scroll-mt-4 text-xl">
            Residential &amp; general messages
          </h2>
          <p className="mb-3 text-sm">From the contact form (excluding senior living community topics).</p>
          {messages.length === 0 ? <EmptyState title="No messages" /> : <MessageList messages={messages} tz={biz.timeZone} />}
        </Card>
        <Card>
          <h2 id="community" className="mb-1 scroll-mt-4 text-xl">
            Community partnership leads
          </h2>
          <p className="mb-3 text-sm">Partnership proposal requests and contact messages about senior living communities.</p>
          <h3 className="mb-2 text-lg">Proposal requests</h3>
          {inquiries.length === 0 ? (
            <EmptyState title="No open proposal requests" />
          ) : (
            <ul className="divide-y divide-line">
              {inquiries.map((i) => (
                <li key={i.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{i.facilityName}</span>
                    <Badge tone="navy">Community</Badge>
                    <Badge tone={i.status === "NEW" ? "warn" : "neutral"}>{i.status.toLowerCase()}</Badge>
                  </div>
                  <p className="text-sm">
                    {[communityTypeLabel(i.communityType), [i.city, i.state].filter(Boolean).join(", "), i.residentCount ? `about ${i.residentCount} residents` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="text-sm">
                    {i.contactName}
                    {i.contactTitle ? `, ${i.contactTitle}` : ""} · {i.email} {i.phone && `· ${i.phone}`} · {formatDateTime(i.createdAt, biz.timeZone)}
                  </p>
                  {(i.visitFrequency || i.interest) && (
                    <p className="text-sm">
                      {[visitFrequencyLabel(i.visitFrequency) && `Preferred visits: ${visitFrequencyLabel(i.visitFrequency)}`, i.interest && `Program: ${i.interest}`].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {i.message && <p className="mt-1 whitespace-pre-wrap">{i.message}</p>}
                  <Link href="/admin/facilities?tab=inquiries" className="text-sm font-semibold">
                    Convert or update in Senior Living
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <h3 className="mt-6 mb-2 text-lg">Community contact messages</h3>
          {communityMessages.length === 0 ? <p>None.</p> : <MessageList messages={communityMessages} tz={biz.timeZone} />}
        </Card>
      </div>
    </div>
  );
}

type Message = { id: string; name: string; email: string | null; phone: string | null; topic: string | null; message: string; status: string; createdAt: Date };

function MessageList({ messages, tz }: { messages: Message[]; tz: string }) {
  return (
    <ul className="divide-y divide-line">
              {messages.map((m) => (
                <li key={m.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{m.name}</span>
                    <Badge tone={m.status === "NEW" ? "warn" : "neutral"}>{m.status.replace("_", " ").toLowerCase()}</Badge>
                    {m.topic && <Badge tone="navy">{m.topic}</Badge>}
                    <span className="text-sm">{formatDateTime(m.createdAt, tz)}</span>
                  </div>
                  <p className="text-sm">{[m.phone, m.email].filter(Boolean).join(" · ")}</p>
                  <p className="mt-1 whitespace-pre-wrap">{m.message}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <form action={convertToCustomer}>
                      <input type="hidden" name="id" value={m.id} />
                      <SubmitButton size="sm" variant="outline">
                        Create customer record
                      </SubmitButton>
                    </form>
                    {["IN_PROGRESS", "DONE", "SPAM"].map((s) => (
                      <form key={s} action={setMessageStatus}>
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="status" value={s} />
                        <SubmitButton size="sm" variant="ghost">
                          Mark {s.replace("_", " ").toLowerCase()}
                        </SubmitButton>
                      </form>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
  );
}
