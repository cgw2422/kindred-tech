import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Checkbox, EmptyState, PageHeader, Table, Td, TextArea, TextInput, Th } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { centsToDollarString, formatCents } from "@/lib/money";
import { ActionForm } from "../../_config/ActionForm";
import { RowAction } from "../../_config/RowAction";
import { SERVICES_NAV, SubNav } from "../../_config/nav";
import { deleteServiceAreaAction, saveServiceAreaAction } from "../actions";

export const metadata: Metadata = { title: "Service Areas" };

export default async function AreasPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("services:manage", "/admin/services/areas");
  const sp = await searchParams;
  const areas = await prisma.serviceArea.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const editing = sp.edit ? areas.find((a) => a.id === sp.edit) : undefined;
  return (
    <div>
      <PageHeader title="Services & Pricing" description="ZIP codes and communities you serve. Bookings outside these areas are flagged for review." />
      <SubNav items={SERVICES_NAV} current="/admin/services/areas" label="Services sections" />
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div>
          {areas.length === 0 ? (
            <EmptyState title="No service areas yet" />
          ) : (
            <Table caption="Service areas">
              <thead>
                <tr>
                  <Th>Area</Th>
                  <Th>ZIP codes</Th>
                  <Th>Communities</Th>
                  <Th>Travel fee</Th>
                  <Th>Status</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {areas.map((a) => (
                  <tr key={a.id}>
                    <Td>
                      <span className="font-semibold">{a.name}</span>
                      <div className="text-sm text-body">
                        {a.county} County, {a.state}
                      </div>
                    </Td>
                    <Td className="max-w-xs text-sm">{a.postalCodes.join(", ")}</Td>
                    <Td className="max-w-xs text-sm">{a.communities.join(", ") || "—"}</Td>
                    <Td>{formatCents(a.travelFeeCents, { showFree: true })}</Td>
                    <Td>
                      <Badge tone={a.isActive ? "green" : "neutral"}>{a.isActive ? "Active" : "Inactive"}</Badge>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/services/areas?edit=${a.id}`}>Edit</Link>
                        <RowAction action={deleteServiceAreaAction} id={a.id} label="Delete" variant="ghost" confirm={`Delete the "${a.name}" service area?`} />
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        <Card>
          <h2 className="mb-3 text-xl">{editing ? `Edit "${editing.name}"` : "Add a service area"}</h2>
          <ActionForm key={editing?.id ?? "new"} action={saveServiceAreaAction} resetOnSuccess={!editing}>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <TextInput label="Name" name="name" required defaultValue={editing?.name} maxLength={120} />
            <div className="grid grid-cols-[1fr_90px] gap-x-4">
              <TextInput label="County" name="county" required defaultValue={editing?.county} />
              <TextInput label="State" name="state" required maxLength={2} defaultValue={editing?.state ?? "OH"} className="uppercase" />
            </div>
            <TextArea label="ZIP codes" name="postalCodes" required rows={3} defaultValue={editing?.postalCodes.join(", ")} hint="5-digit ZIP codes separated by commas or spaces." />
            <TextArea label="Communities" name="communities" rows={2} defaultValue={editing?.communities.join(", ")} hint="Town names separated by commas." />
            <div className="grid grid-cols-2 gap-x-4">
              <TextInput label="Travel fee ($)" name="travelFee" required inputMode="decimal" defaultValue={editing ? centsToDollarString(editing.travelFeeCents) : "0"} />
              <TextInput label="Sort order" name="sortOrder" type="number" defaultValue={editing?.sortOrder ?? 0} />
            </div>
            <TextArea label="Internal notes" name="notes" rows={2} defaultValue={editing?.notes ?? ""} />
            <Checkbox name="isActive" label="Active" defaultChecked={editing?.isActive ?? true} />
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton>{editing ? "Save area" : "Add area"}</SubmitButton>
              {editing && <Link href="/admin/services/areas">Cancel</Link>}
            </div>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
