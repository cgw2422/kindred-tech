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
import { deleteBundleAction, saveBundleAction } from "../actions";

export const metadata: Metadata = { title: "Service Bundles" };

export default async function BundlesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("services:manage", "/admin/services/bundles");
  const sp = await searchParams;
  const [bundles, services] = await Promise.all([
    prisma.serviceBundle.findMany({ orderBy: { name: "asc" }, include: { items: { include: { service: { select: { name: true, basePriceCents: true } } } } } }),
    prisma.service.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }], select: { id: true, name: true, basePriceCents: true, isActive: true } }),
  ]);
  const editing = sp.edit ? bundles.find((b) => b.id === sp.edit) : undefined;
  const qty = (serviceId: string) => editing?.items.find((i) => i.serviceId === serviceId)?.quantity ?? "";
  return (
    <div>
      <PageHeader title="Services & Pricing" description="Packages of several services sold together at one price." />
      <SubNav items={SERVICES_NAV} current="/admin/services/bundles" label="Services sections" />
      <div className="grid gap-6 xl:grid-cols-[1fr_440px]">
        <div>
          {bundles.length === 0 ? (
            <EmptyState title="No bundles yet" />
          ) : (
            <Table caption="Bundles">
              <thead>
                <tr>
                  <Th>Bundle</Th>
                  <Th>Includes</Th>
                  <Th>Price</Th>
                  <Th>Status</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {bundles.map((b) => {
                  const regular = b.items.reduce((sum, i) => sum + i.service.basePriceCents * i.quantity, 0);
                  return (
                    <tr key={b.id}>
                      <Td className="font-semibold">{b.name}</Td>
                      <Td>
                        <ul>
                          {b.items.map((i) => (
                            <li key={i.id}>
                              {i.quantity} × {i.service.name}
                            </li>
                          ))}
                        </ul>
                      </Td>
                      <Td>
                        {formatCents(b.priceCents)}
                        {regular > b.priceCents && <div className="text-sm text-body">Saves {formatCents(regular - b.priceCents)}</div>}
                      </Td>
                      <Td>
                        <Badge tone={b.isActive ? "green" : "neutral"}>{b.isActive ? "Active" : "Inactive"}</Badge>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/admin/services/bundles?edit=${b.id}`}>Edit</Link>
                          <RowAction action={deleteBundleAction} id={b.id} label="Delete" variant="ghost" confirm={`Delete the "${b.name}" bundle?`} />
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
          <h2 className="mb-3 text-xl">{editing ? `Edit "${editing.name}"` : "Create a bundle"}</h2>
          <ActionForm key={editing?.id ?? "new"} action={saveBundleAction} resetOnSuccess={!editing}>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <TextInput label="Name" name="name" required defaultValue={editing?.name} maxLength={120} />
            <TextArea label="Description" name="description" rows={2} defaultValue={editing?.description ?? ""} />
            <TextInput label="Bundle price ($)" name="price" required inputMode="decimal" defaultValue={editing ? centsToDollarString(editing.priceCents) : ""} />
            <fieldset className="mb-4">
              <legend className="mb-1 font-semibold text-navy">Included services</legend>
              <p className="mb-2 text-sm text-body">Enter a quantity for each service in the bundle; leave blank to exclude.</p>
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border border-line p-3">
                {services.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3">
                    <label htmlFor={`qty_${s.id}`} className="min-w-0">
                      {s.name} <span className="text-sm text-body">({formatCents(s.basePriceCents)})</span>
                      {!s.isActive && <span className="text-sm text-body"> — inactive</span>}
                    </label>
                    <input id={`qty_${s.id}`} name={`qty_${s.id}`} type="number" min={0} max={50} defaultValue={qty(s.id)} className="w-20 rounded-md border-2 border-line px-2 py-1.5" />
                  </div>
                ))}
              </div>
            </fieldset>
            <Checkbox name="isActive" label="Active" defaultChecked={editing?.isActive ?? true} />
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton>{editing ? "Save bundle" : "Create bundle"}</SubmitButton>
              {editing && <Link href="/admin/services/bundles">Cancel</Link>}
            </div>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
