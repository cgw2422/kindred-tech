import type { Metadata } from "next";
import Link from "next/link";
import { Badge, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/time";
import { DEFAULT_TEMPLATES } from "@/lib/email/defaults";

export const metadata: Metadata = { title: "Email Templates" };

export default async function EmailTemplatesPage() {
  await requirePermission("templates:manage", "/admin/email-templates");
  const tz = (await getSettings("business")).timeZone;
  const templates = await prisma.emailTemplate.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] });
  return (
    <div>
      <PageHeader title="Email Templates" description="The wording of every automatic email. Edit the text, preview it, and send yourself a test." />
      {templates.length === 0 ? (
        <EmptyState title="No templates found">Run the database seed to install the default templates.</EmptyState>
      ) : (
        <Table caption="Email templates">
          <thead>
            <tr>
              <Th>Template</Th>
              <Th>Key</Th>
              <Th>Category</Th>
              <Th>Status</Th>
              <Th>Last updated</Th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => {
              const def = DEFAULT_TEMPLATES.find((d) => d.key === t.key);
              const customized = def && (def.subject !== t.subject || def.body !== t.body);
              return (
                <tr key={t.id}>
                  <Td>
                    <Link href={`/admin/email-templates/${t.id}`} className="font-semibold">
                      {t.name}
                    </Link>
                    {(t.description ?? def?.description) && <div className="text-sm text-body">{t.description ?? def?.description}</div>}
                  </Td>
                  <Td>
                    <code className="text-sm">{t.key}</code>
                  </Td>
                  <Td>
                    <Badge tone={t.category === "MARKETING" ? "warn" : "navy"}>{t.category === "MARKETING" ? "Marketing" : "Transactional"}</Badge>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={t.isActive ? "green" : "neutral"}>{t.isActive ? "Active" : "Inactive"}</Badge>
                      {customized && <Badge>Customized</Badge>}
                    </div>
                  </Td>
                  <Td className="text-sm">{formatDateTime(t.updatedAt, tz)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <p className="mt-4 text-sm text-body">Marketing emails are only sent to customers who have opted in, and always include an unsubscribe link.</p>
    </div>
  );
}
