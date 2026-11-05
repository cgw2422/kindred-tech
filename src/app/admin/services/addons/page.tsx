import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Checkbox, EmptyState, PageHeader, Select, Table, Td, TextArea, TextInput, Th } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { centsToDollarString, formatCents } from "@/lib/money";
import { ActionForm } from "../../_config/ActionForm";
import { RowAction } from "../../_config/RowAction";
import { SERVICES_NAV, SubNav } from "../../_config/nav";
import { removeAddonAction, saveAddonAction } from "../actions";

export const metadata: Metadata = { title: "Service Add-ons" };

export default async function AddonsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("services:manage", "/admin/services/addons");
  const sp = await searchParams;
  const [addons, services] = await Promise.all([
    prisma.serviceAddon.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }], include: { service: { select: { name: true } } } }),
    prisma.service.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const editing = sp.edit ? addons.find((a) => a.id === sp.edit) : undefined;
  return (
    <div>
      <PageHeader title="Services & Pricing" description="Optional extras customers can add when booking. An add-on can apply to one service or to all services." />
      <SubNav items={SERVICES_NAV} current="/admin/services/addons" label="Services sections" />
      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div>
          {addons.length === 0 ? (
            <EmptyState title="No add-ons yet" />
          ) : (
            <Table caption="Add-ons">
              <thead>
                <tr>
                  <Th>Add-on</Th>
                  <Th>Applies to</Th>
                  <Th>Price</Th>
                  <Th>Extra time</Th>
                  <Th>Status</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {addons.map((a) => (
                  <tr key={a.id}>
                    <Td className="font-semibold">{a.name}</Td>
                    <Td>{a.service?.name ?? "All services"}</Td>
                    <Td>{formatCents(a.priceCents)}</Td>
                    <Td>{a.durationMinutes ? `${a.durationMinutes} min` : "—"}</Td>
                    <Td>
                      <Badge tone={a.isActive ? "green" : "neutral"}>{a.isActive ? "Active" : "Inactive"}</Badge>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/services/addons?edit=${a.id}`}>Edit</Link>
                        <RowAction action={removeAddonAction} id={a.id} label="Delete" variant="ghost" confirm={`Delete "${a.name}"? If it was used on appointments it will be deactivated instead.`} />
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        <Card>
          <h2 className="mb-3 text-xl">{editing ? `Edit "${editing.name}"` : "Add an add-on"}</h2>
          <ActionForm key={editing?.id ?? "new"} action={saveAddonAction} resetOnSuccess={!editing}>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <TextInput label="Name" name="name" required defaultValue={editing?.name} maxLength={120} />
            <TextArea label="Description" name="description" rows={2} defaultValue={editing?.description ?? ""} />
            <Select label="Applies to" name="serviceId" defaultValue={editing?.serviceId ?? ""} placeholder="All services (global)" options={services.map((s) => ({ value: s.id, label: s.name }))} />
            <div className="grid grid-cols-2 gap-x-4">
              <TextInput label="Price ($)" name="price" required inputMode="decimal" defaultValue={editing ? centsToDollarString(editing.priceCents) : ""} />
              <TextInput label="Extra minutes" name="durationMinutes" required type="number" min={0} step={5} defaultValue={editing?.durationMinutes ?? 0} />
            </div>
            <Checkbox name="isActive" label="Active" defaultChecked={editing?.isActive ?? true} />
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton>{editing ? "Save add-on" : "Add add-on"}</SubmitButton>
              {editing && <Link href="/admin/services/addons">Cancel</Link>}
            </div>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
