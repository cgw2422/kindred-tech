import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { listAdminArticles } from "@/lib/articles/service";
import { Badge, ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/forms";
import { readFlash } from "@/lib/admin-helpers";
import { formatDateTime } from "@/lib/time";
import { bulkArticlesAction } from "./actions";

export const metadata = { title: "Tech Tips" };

const STATUS_TONE = { DRAFT: "neutral", SCHEDULED: "warn", PUBLISHED: "green" } as const;
const STATUS_LABEL = { DRAFT: "Draft", SCHEDULED: "Scheduled", PUBLISHED: "Published" } as const;

export default async function AdminTechTipsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("website:manage", "/admin/tech-tips");
  const sp = await searchParams;
  const flash = readFlash(sp);
  const [articles, categories, counts] = await Promise.all([
    listAdminArticles({ q: sp.q, status: sp.status, categoryId: sp.category, featured: sp.featured === "1" }),
    prisma.articleCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.article.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const now = new Date();
  return (
    <div>
      <PageHeader
        title="Tech Tips"
        description={`${count("PUBLISHED")} published · ${count("SCHEDULED")} scheduled · ${count("DRAFT")} drafts`}
        actions={
          <>
            <ButtonLink href="/admin/tech-tips/categories" variant="outline">
              Categories
            </ButtonLink>
            <ButtonLink href="/admin/tech-tips/new">New article</ButtonLink>
          </>
        }
      />
      <Flash flash={flash} />
      <form method="get" className="mb-5 flex flex-wrap items-end gap-3" role="search">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="block font-semibold text-navy">
            Search
          </label>
          <input id="q" name="q" type="search" defaultValue={sp.q} placeholder="Title, URL, or summary" className="min-h-[44px] w-full rounded-md border-2 border-line px-3" />
        </div>
        <div>
          <label htmlFor="status" className="block font-semibold text-navy">
            Status
          </label>
          <select id="status" name="status" defaultValue={sp.status ?? ""} className="min-h-[44px] rounded-md border-2 border-line px-3">
            <option value="">Any</option>
            <option value="DRAFT">Draft</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="PUBLISHED">Published</option>
          </select>
        </div>
        <div>
          <label htmlFor="category" className="block font-semibold text-navy">
            Category
          </label>
          <select id="category" name="category" defaultValue={sp.category ?? ""} className="min-h-[44px] rounded-md border-2 border-line px-3">
            <option value="">Any</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <label className="flex min-h-[44px] items-center gap-2">
          <input type="checkbox" name="featured" value="1" defaultChecked={sp.featured === "1"} className="h-5 w-5" /> Featured only
        </label>
        <button className="min-h-[44px] rounded-md bg-navy px-4 font-semibold text-white">Filter</button>
      </form>

      {articles.length === 0 ? (
        <EmptyState title="No articles match">Try another search, or create a new article.</EmptyState>
      ) : (
        <form action={bulkArticlesAction}>
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-line bg-white p-3">
            <span className="font-semibold text-navy">With selected:</span>
            <SubmitButton name="bulk" value="publish" size="sm" confirm="Publish the selected articles now?">
              Publish
            </SubmitButton>
            <SubmitButton name="bulk" value="unpublish" size="sm" variant="outline" confirm="Unpublish the selected articles?">
              Unpublish
            </SubmitButton>
            <span className="text-sm">Tip: review drafts with Preview before publishing.</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Tech Tips articles</caption>
              <thead>
                <tr className="bg-soft">
                  <th scope="col" className="border-b border-line px-3 py-3">
                    <span className="sr-only">Select</span>
                  </th>
                  <th scope="col" className="border-b border-line px-3 py-3 font-bold text-navy">
                    Title
                  </th>
                  <th scope="col" className="border-b border-line px-3 py-3 font-bold text-navy">
                    Category
                  </th>
                  <th scope="col" className="border-b border-line px-3 py-3 font-bold text-navy">
                    Status
                  </th>
                  <th scope="col" className="border-b border-line px-3 py-3 font-bold text-navy">
                    Updated
                  </th>
                  <th scope="col" className="border-b border-line px-3 py-3 font-bold text-navy">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {articles.map((a) => {
                  const live = (a.status === "PUBLISHED" || a.status === "SCHEDULED") && a.publishedAt && a.publishedAt <= now;
                  return (
                    <tr key={a.id} className="hover:bg-soft">
                      <td className="border-b border-line px-3 py-3 align-top">
                        <input type="checkbox" name="ids" value={a.id} aria-label={`Select ${a.title}`} className="h-5 w-5" />
                      </td>
                      <td className="border-b border-line px-3 py-3 align-top">
                        <Link href={`/admin/tech-tips/${a.id}`} className="font-semibold">
                          {a.title}
                        </Link>
                        <span className="block text-sm">/tech-tips/{a.slug}</span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          {a.featured && <Badge tone="navy">Featured</Badge>}
                          {!a.featuredImageId && <Badge>No featured image</Badge>}
                        </span>
                      </td>
                      <td className="border-b border-line px-3 py-3 align-top">{a.category?.name ?? "—"}</td>
                      <td className="border-b border-line px-3 py-3 align-top">
                        <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                        {a.status === "SCHEDULED" && a.scheduledFor && <span className="block text-sm">{live ? "Live since" : "Goes live"} {formatDateTime(a.scheduledFor)}</span>}
                        {a.status === "PUBLISHED" && a.publishedAt && <span className="block text-sm">{formatDateTime(a.publishedAt)}</span>}
                      </td>
                      <td className="border-b border-line px-3 py-3 align-top text-sm">{formatDateTime(a.updatedAt)}</td>
                      <td className="border-b border-line px-3 py-3 align-top whitespace-nowrap">
                        <Link href={`/tech-tips/preview/${a.id}`} target="_blank" className="font-semibold">
                          Preview<span className="sr-only"> {a.title} (opens in a new tab)</span>
                        </Link>
                        {live && (
                          <Link href={`/tech-tips/${a.slug}`} target="_blank" className="ml-3 font-semibold">
                            View<span className="sr-only"> {a.title} (opens in a new tab)</span>
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </form>
      )}
    </div>
  );
}
