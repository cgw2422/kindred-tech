import type { Metadata } from "next";
import { Card, PageHeader, Select, TextArea, TextInput } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ActionForm } from "../../_config/ActionForm";
import { COMMS_NAV, SubNav } from "../../_config/nav";
import { logCommunicationAction } from "../actions";
import { CustomerPicker } from "./CustomerPicker";

export const metadata: Metadata = { title: "Log a Call or Note" };

export default async function LogCommunicationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("communications:view", "/admin/communications/log");
  const sp = await searchParams;
  const pre = sp.customerId
    ? await prisma.customer.findUnique({ where: { id: sp.customerId }, select: { id: true, firstName: true, lastName: true, phone: true, email: true } })
    : null;
  return (
    <div>
      <PageHeader title="Communications" description="Record a phone call or a note so everyone can see the history with a customer." />
      <SubNav items={COMMS_NAV} current="/admin/communications/log" label="Communications sections" />
      <Card className="max-w-2xl">
        <ActionForm action={logCommunicationAction} resetOnSuccess>
          <CustomerPicker initial={pre ? { id: pre.id, label: `${pre.firstName} ${pre.lastName}`, detail: [pre.phone, pre.email].filter(Boolean).join(" · ") } : null} />
          <div className="grid gap-x-6 sm:grid-cols-2">
            <Select
              label="Type"
              name="channel"
              required
              defaultValue="PHONE"
              options={[
                { value: "PHONE", label: "Phone call" },
                { value: "NOTE", label: "Note" },
              ]}
            />
            <Select
              label="Direction (calls)"
              name="direction"
              defaultValue="INBOUND"
              options={[
                { value: "INBOUND", label: "Customer called us" },
                { value: "OUTBOUND", label: "We called the customer" },
              ]}
            />
          </div>
          <TextInput label="Summary" name="subject" required maxLength={200} hint="One line, e.g. Asked to move Tuesday visit to Thursday." />
          <TextArea label="Details" name="body" rows={6} maxLength={5000} hint="Do not record passwords, card numbers or other sensitive details." />
          <SubmitButton>Save</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
