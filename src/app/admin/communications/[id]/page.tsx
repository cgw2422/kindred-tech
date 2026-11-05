import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, DefinitionList, PageHeader } from "@/components/ui";
import { humanize } from "@/components/status";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/time";
import { commStatusTone } from "../../_config/tones";

export const metadata: Metadata = { title: "Communication" };

export default async function CommunicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission("communications:view", `/admin/communications/${id}`);
  const tz = (await getSettings("business")).timeZone;
  const c = await prisma.communication.findUnique({
    where: { id },
    include: { customer: { select: { id: true, firstName: true, lastName: true } }, facility: { select: { id: true, name: true } } },
  });
  if (!c) notFound();
  const createdBy = c.createdById ? await prisma.user.findUnique({ where: { id: c.createdById }, select: { name: true } }) : null;
  return (
    <div className="max-w-4xl">
      <p className="mb-2">
        <Link href="/admin/communications">← Communication log</Link>
      </p>
      <PageHeader title={c.subject ?? c.templateKey ?? humanize(c.channel)} description={formatDateTime(c.createdAt, tz)} />
      <Card>
        <DefinitionList
          items={[
            ["Status", <Badge key="s" tone={commStatusTone[c.status]}>{humanize(c.status)}</Badge>],
            ["Status reason", c.statusReason ?? "—"],
            ["Channel", `${humanize(c.channel)} (${humanize(c.direction)})`],
            ["Customer", c.customer ? <Link href={`/admin/customers/${c.customer.id}`}>{`${c.customer.firstName} ${c.customer.lastName}`}</Link> : "—"],
            ["Facility", c.facility ? <Link href={`/admin/facilities/${c.facility.id}`}>{c.facility.name}</Link> : "—"],
            ["To", c.toAddress ?? "—"],
            ["Template", c.templateKey ? <code>{c.templateKey}</code> : "—"],
            ["Subject", c.subject ?? "—"],
            ["Provider", c.provider ?? "—"],
            ["Provider message ID", c.providerMessageId ? <code className="break-all">{c.providerMessageId}</code> : "—"],
            ["Sent at", c.sentAt ? formatDateTime(c.sentAt, tz) : "—"],
            ["Related to", c.relatedType ? `${c.relatedType}${c.relatedId ? ` ${c.relatedId}` : ""}` : "—"],
            ["Recorded by", createdBy?.name ?? (c.createdById ? "Former user" : "System")],
          ]}
        />
      </Card>
      <Card className="mt-6">
        <h2 className="mb-2 text-xl">Message</h2>
        {c.bodyPreview ? (
          <pre className="whitespace-pre-wrap break-words font-sans text-base">{c.bodyPreview}</pre>
        ) : (
          <p className="text-body">No message text was recorded{c.status === "QUEUED" ? " yet — it is rendered when the email is processed" : ""}.</p>
        )}
      </Card>
    </div>
  );
}
