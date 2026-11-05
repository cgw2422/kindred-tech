import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/forms";
import { readFlash } from "@/lib/admin-helpers";
import { deleteCategoryAction, saveCategoryAction } from "../actions";

export const metadata = { title: "Tech Tips Categories" };

const f = "min-h-[44px] w-full rounded-md border-2 border-line px-3";
const l = "mb-1 block font-semibold text-navy";

function CategoryFields({ c, idp }: { c?: { name: string; slug: string; description: string | null; sortOrder: number }; idp: string }) {
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_1fr_100px]">
      <div>
        <label htmlFor={`${idp}-name`} className={l}>
          Name
        </label>
        <input id={`${idp}-name`} name="name" required defaultValue={c?.name} className={f} />
      </div>
      <div>
        <label htmlFor={`${idp}-slug`} className={l}>
          URL slug
        </label>
        <input id={`${idp}-slug`} name="slug" defaultValue={c?.slug} placeholder="Created from the name" className={f} />
      </div>
      <div>
        <label htmlFor={`${idp}-order`} className={l}>
          Order
        </label>
        <input id={`${idp}-order`} name="sortOrder" type="number" defaultValue={c?.sortOrder ?? 0} className={f} />
      </div>
      <div className="md:col-span-3">
        <label htmlFor={`${idp}-desc`} className={l}>
          Description
        </label>
        <input id={`${idp}-desc`} name="description" defaultValue={c?.description ?? ""} className={f} />
      </div>
    </div>
  );
}

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("website:manage", "/admin/tech-tips/categories");
  const flash = readFlash(await searchParams);
  const cats = await prisma.articleCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { articles: true } } } });
  return (
    <div className="max-w-4xl">
      <p className="mb-2">
        <Link href="/admin/tech-tips">Back to Tech Tips</Link>
      </p>
      <PageHeader title="Tech Tips categories" />
      <Flash flash={flash} />
      <Card className="mb-6">
        <h2 className="mb-3 text-xl">Add a category</h2>
        <form action={saveCategoryAction}>
          <CategoryFields idp="new" />
          <div className="mt-3">
            <SubmitButton>Add category</SubmitButton>
          </div>
        </form>
      </Card>
      <ul className="space-y-4">
        {cats.map((c) => (
          <li key={c.id}>
            <Card>
              <form action={saveCategoryAction}>
                <input type="hidden" name="id" value={c.id} />
                <CategoryFields c={c} idp={c.id} />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <SubmitButton size="sm">Save</SubmitButton>
                  <span className="text-sm">
                    {c._count.articles} article{c._count.articles === 1 ? "" : "s"} · <Link href={`/tech-tips/category/${c.slug}`}>/tech-tips/category/{c.slug}</Link>
                  </span>
                </div>
              </form>
              {c._count.articles === 0 && (
                <form action={deleteCategoryAction} className="mt-2">
                  <input type="hidden" name="id" value={c.id} />
                  <SubmitButton size="sm" variant="ghost" confirm={`Delete the category "${c.name}"?`}>
                    Delete category
                  </SubmitButton>
                </form>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
