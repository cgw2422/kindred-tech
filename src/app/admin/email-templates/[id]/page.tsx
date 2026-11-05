import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader, TextInput } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { integrationStatus } from "@/lib/env";
import { DEFAULT_TEMPLATES } from "@/lib/email/defaults";
import { previewTemplate, sampleVarsFor, templateVariables } from "@/lib/admin/templates";
import { ActionForm } from "../../_config/ActionForm";
import { resetTemplateAction, sendTestEmailAction } from "../actions";
import { TemplateEditor } from "./TemplateEditor";

export const metadata: Metadata = { title: "Edit Email Template" };

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("templates:manage", `/admin/email-templates/${id}`);
  const t = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!t) notFound();
  const def = DEFAULT_TEMPLATES.find((d) => d.key === t.key);
  const preview = await previewTemplate(t.key, t.subject, t.body);
  const vars = templateVariables(t.key);
  const samples = sampleVarsFor(t.key);
  const integ = integrationStatus();

  return (
    <div>
      <p className="mb-2">
        <Link href="/admin/email-templates">← All templates</Link>
      </p>
      <PageHeader
        title={t.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <code>{t.key}</code>
            <Badge tone={t.category === "MARKETING" ? "warn" : "navy"}>{t.category === "MARKETING" ? "Marketing" : "Transactional"}</Badge>
            {def?.description && <span>{def.description}</span>}
          </span>
        }
      />

      <TemplateEditor id={t.id} templateKey={t.key} initialSubject={t.subject} initialBody={t.body} initialActive={t.isActive} initialPreview={preview} />

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-3">
        <Card>
          <h2 className="mb-2 text-xl">Formatting help</h2>
          <ul className="space-y-2">
            <li>
              <code>**bold text**</code> — <strong>bold text</strong>
            </li>
            <li>
              <code>[link text](https://...)</code> — a link
            </li>
            <li>
              <code>[[button:Label|https://...]]</code> — a large button (on its own line)
            </li>
            <li>
              Lines starting with <code>- </code> — a bulleted list
            </li>
            <li>A blank line starts a new paragraph</li>
            <li>
              <code>{"{{variableName}}"}</code> — filled in automatically (see the list)
            </li>
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 text-xl">Available variables</h2>
          <p className="mb-2 text-sm text-body">Sample values are used in the preview and test emails.</p>
          <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
            {vars.map((v) => (
              <li key={v}>
                <code>{`{{${v}}}`}</code>
                {samples[v] ? <span className="text-body"> — e.g. {samples[v].length > 60 ? `${samples[v].slice(0, 60)}…` : samples[v]}</span> : null}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 text-xl">Send a test email</h2>
          <p className="mb-3 text-sm text-body">
            Uses the saved version and sample values. Email is {integ.email ? "configured" : "not configured"}; delivery mode is <strong>{integ.emailMode}</strong>. Delivery is skipped unless email is configured and EMAIL_DELIVERY_MODE allows the
            recipient — the result below shows exactly what happened.
          </p>
          <ActionForm action={sendTestEmailAction}>
            <input type="hidden" name="key" value={t.key} />
            <TextInput label="Send to" name="to" type="email" required defaultValue={user.email} />
            <SubmitButton variant="secondary">Send test</SubmitButton>
          </ActionForm>
          {def && (
            <div className="mt-6 border-t border-line pt-4">
              <h3 className="mb-2 text-lg">Reset to default</h3>
              <p className="mb-3 text-sm text-body">Replaces the subject and body with the original wording.</p>
              <ActionForm action={resetTemplateAction}>
                <input type="hidden" name="id" value={t.id} />
                <SubmitButton variant="danger" confirm="Replace this template with the default wording? Your changes will be lost.">
                  Reset to default
                </SubmitButton>
              </ActionForm>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
