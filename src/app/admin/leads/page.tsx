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
  const [messages, inquiries] = await Promise.all([
    prisma.contactMessage.findMany({ where: show === "all" ? {} : { status: { in: ["NEW", "IN_PROGRESS"] } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.facilityInquiry.findMany({ where: show === "all" ? {} : { status: "NEW" }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return (
    <div>
      <PageHeader
        title="Messages & leads"
        description="Contact form messages and senior living partnership inquiries."
        actions={
          <Link href={`/admin/leads?show=${show === "all" ? "open" : "all"}`} className="font-semibold">
            {show === "all" ? "Show open only" : "Show all"}
          </Link>
        }
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-xl">Contact form messages</h2>
          {messages.length === 0 ? (
            <EmptyState title="No messages" />
          ) : (
            <ul className="divide-y divide-line">
              {messages.map((m) => (
                <li key={m.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{m.name}</span>
                    <Badge tone={m.status === "NEW" ? "warn" : "neutral"}>{m.status.replace("_", " ").toLowerCase()}</Badge>
                    {m.topic && <Badge tone="navy">{m.topic}</Badge>}
                    <span className="text-sm">{formatDateTime(m.createdAt, biz.timeZone)}</span>
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
          )}
        </Card>
        <Card>
          <h2 className="mb-3 text-xl">Facility partnership inquiries</h2>
          {inquiries.length === 0 ? (
            <EmptyState title="No inquiries" />
          ) : (
            <ul className="divide-y divide-line">
              {inquiries.map((i) => (
                <li key={i.id} className="py-3">
                  <p className="font-semibold">
                    {i.facilityName} {i.city && `(${i.city})`}
                  </p>
                  <p className="text-sm">
                    {i.contactName}
                    {i.contactTitle ? `, ${i.contactTitle}` : ""} · {i.email} {i.phone && `· ${i.phone}`} · {formatDateTime(i.createdAt, biz.timeZone)}
                  </p>
                  {i.interest && <p className="text-sm">Interested in: {i.interest}</p>}
                  {i.message && <p className="mt-1 whitespace-pre-wrap">{i.message}</p>}
                  <Link href="/admin/facilities?tab=inquiries" className="text-sm font-semibold">
                    Manage in Senior Living
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
