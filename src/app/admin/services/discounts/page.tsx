import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Checkbox, EmptyState, PageHeader, Select, Table, Td, TextInput, Th } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { centsToDollarString, formatCents } from "@/lib/money";
import { addDaysToKey, formatDate, toDateKey } from "@/lib/time";
import { ActionForm } from "../../_config/ActionForm";
import { RowAction } from "../../_config/RowAction";
import { SERVICES_NAV, SubNav } from "../../_config/nav";
import { removeDiscountAction, saveDiscountAction } from "../actions";

export const metadata: Metadata = { title: "Discounts" };

export default async function DiscountsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("services:manage", "/admin/services/discounts");
  const sp = await searchParams;
  const tz = (await getSettings("business")).timeZone;
  const [discounts, services] = await Promise.all([
    prisma.discount.findMany({ orderBy: [{ isActive: "desc" }, { createdAt: "desc" }], include: { service: { select: { name: true } } } }),
    prisma.service.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const editing = sp.edit ? discounts.find((d) => d.id === sp.edit) : undefined;
  const now = new Date();
  const short = { weekday: undefined, month: "short", year: "numeric" } as const;
  // Stored end is exclusive (midnight after the last day); show the inclusive last day.
  const endKey = (d: Date | null) => (d ? addDaysToKey(toDateKey(d, tz), -1) : "");
  return (
    <div>
      <PageHeader title="Services & Pricing" description="Promotional codes and automatic discounts. Percent discounts are 1–100%; fixed discounts take a dollar amount off." />
      <SubNav items={SERVICES_NAV} current="/admin/services/discounts" label="Services sections" />
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div>
          {discounts.length === 0 ? (
            <EmptyState title="No discounts yet" />
          ) : (
            <Table caption="Discounts">
              <thead>
                <tr>
                  <Th>Discount</Th>
                  <Th>Amount</Th>
                  <Th>Service</Th>
                  <Th>Dates</Th>
                  <Th>Used</Th>
                  <Th>Status</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {discounts.map((d) => {
                  const expired = d.endsAt && d.endsAt < now;
                  const exhausted = d.maxUses != null && d.usedCount >= d.maxUses;
                  return (
                    <tr key={d.id}>
                      <Td>
                        <span className="font-semibold">{d.name}</span>
                        <div className="text-sm text-body">{d.code ? <code>{d.code}</code> : "No code (applied by staff)"}</div>
                      </Td>
                      <Td>{d.type === "PERCENT" ? `${d.value}% off` : `${formatCents(d.value)} off`}</Td>
                      <Td>{d.service?.name ?? "Any service"}</Td>
                      <Td className="text-sm">
                        {d.startsAt ? formatDate(d.startsAt, tz, short) : "Any time"}
                        {" – "}
                        {d.endsAt ? formatDate(new Date(d.endsAt.getTime() - 1), tz, short) : "no end"}
                      </Td>
                      <Td>
                        {d.usedCount}
                        {d.maxUses != null ? ` of ${d.maxUses}` : ""}
                      </Td>
                      <Td>
                        {!d.isActive ? <Badge>Inactive</Badge> : expired ? <Badge tone="warn">Expired</Badge> : exhausted ? <Badge tone="warn">Used up</Badge> : <Badge tone="green">Active</Badge>}
                      </Td>
                      <Td>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/admin/services/discounts?edit=${d.id}`}>Edit</Link>
                          <RowAction action={removeDiscountAction} id={d.id} label="Delete" variant="ghost" confirm={`Delete "${d.name}"? If it has been used it will be deactivated instead.`} />
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </div>
        <Card>
          <h2 className="mb-3 text-xl">{editing ? `Edit "${editing.name}"` : "Add a discount"}</h2>
          <ActionForm key={editing?.id ?? "new"} action={saveDiscountAction} resetOnSuccess={!editing}>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <TextInput label="Name" name="name" required defaultValue={editing?.name} maxLength={120} hint="For example: Veterans discount." />
            <TextInput label="Code" name="code" defaultValue={editing?.code ?? ""} hint="Leave blank for a discount staff apply manually." className="uppercase" />
            <div className="grid grid-cols-2 gap-x-4">
              <Select
                label="Type"
                name="type"
                required
                defaultValue={editing?.type ?? "PERCENT"}
                options={[
                  { value: "PERCENT", label: "Percent off" },
                  { value: "FIXED", label: "Dollars off" },
                ]}
              />
              <TextInput
                label="Amount"
                name="value"
                required
                inputMode="decimal"
                defaultValue={editing ? (editing.type === "PERCENT" ? String(editing.value) : centsToDollarString(editing.value)) : ""}
                hint="Percent (1–100) or dollars."
              />
            </div>
            <Select label="Limit to service" name="serviceId" defaultValue={editing?.serviceId ?? ""} placeholder="Any service" options={services.map((s) => ({ value: s.id, label: s.name }))} />
            <div className="grid grid-cols-2 gap-x-4">
              <TextInput label="Starts" name="startDate" type="date" defaultValue={editing?.startsAt ? toDateKey(editing.startsAt, tz) : ""} />
              <TextInput label="Ends (last day)" name="endDate" type="date" defaultValue={endKey(editing?.endsAt ?? null)} />
            </div>
            <TextInput label="Maximum uses" name="maxUses" type="number" min={1} defaultValue={editing?.maxUses ?? ""} hint={editing ? `Used ${editing.usedCount} time(s) so far.` : "Leave blank for unlimited."} />
            <Checkbox name="isActive" label="Active" defaultChecked={editing?.isActive ?? true} />
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton>{editing ? "Save discount" : "Add discount"}</SubmitButton>
              {editing && <Link href="/admin/services/discounts">Cancel</Link>}
            </div>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
