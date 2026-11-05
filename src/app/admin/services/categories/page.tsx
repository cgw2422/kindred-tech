import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, PageHeader, Table, Td, Th, TextInput } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { requirePermission } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ActionForm } from "../../_config/ActionForm";
import { RowAction } from "../../_config/RowAction";
import { SERVICES_NAV, SubNav } from "../../_config/nav";
import { deleteCategoryAction, saveCategoryAction } from "../actions";

export const metadata: Metadata = { title: "Service Categories" };

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("services:manage", "/admin/services/categories");
  const sp = await searchParams;
  const categories = await prisma.serviceCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { services: true } } } });
  const editing = sp.edit ? categories.find((c) => c.id === sp.edit) : undefined;
  return (
    <div>
      <PageHeader title="Services & Pricing" description="Group services into categories for the website and booking page." />
      <SubNav items={SERVICES_NAV} current="/admin/services/categories" label="Services sections" />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div>
          {categories.length === 0 ? (
            <EmptyState title="No categories yet" />
          ) : (
            <Table caption="Service categories">
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Slug</Th>
                  <Th>Order</Th>
                  <Th>Services</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <Td className="font-semibold">{c.name}</Td>
                    <Td>{c.slug}</Td>
                    <Td>{c.sortOrder}</Td>
                    <Td>{c._count.services}</Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/services/categories?edit=${c.id}`}>Edit</Link>
                        <RowAction action={deleteCategoryAction} id={c.id} label="Delete" variant="ghost" confirm={`Delete "${c.name}"? Its services will become uncategorized.`} />
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        <Card>
          <h2 className="mb-3 text-xl">{editing ? `Edit "${editing.name}"` : "Add a category"}</h2>
          <ActionForm key={editing?.id ?? "new"} action={saveCategoryAction} resetOnSuccess={!editing}>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <TextInput label="Name" name="name" required defaultValue={editing?.name} maxLength={80} />
            <TextInput label="Slug" name="slug" required defaultValue={editing?.slug} hint="Lowercase with dashes, e.g. home-visits." />
            <TextInput label="Sort order" name="sortOrder" type="number" defaultValue={editing?.sortOrder ?? 0} />
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton>{editing ? "Save category" : "Add category"}</SubmitButton>
              {editing && <Link href="/admin/services/categories">Cancel</Link>}
            </div>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
