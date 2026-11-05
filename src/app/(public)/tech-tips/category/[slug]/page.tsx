import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { EmptyState } from "@/components/ui";
import { listPublicArticles, publicCategories } from "@/lib/articles/service";
import { PageIntro } from "../../../_components/Blocks";
import { pageMetadata } from "../../../_lib/seo";
import { ArticleCard } from "../../_components/ArticleCard";
import { Pagination } from "../../_components/Pagination";
import { CategoryNav, SearchForm } from "../../_components/TipsSidebar";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const cat = await prisma.articleCategory.findUnique({ where: { slug } });
  if (!cat) return { title: "Topic Not Found", robots: { index: false } };
  const base = pageMetadata({
    path: `/tech-tips/category/${cat.slug}`,
    title: `${cat.name} Tips`,
    description: cat.description || `Plain-language ${cat.name.toLowerCase()} tips for seniors and families from Kindred Tech Support.`,
  });
  return sp.page && sp.page !== "1" ? { ...base, robots: { index: false, follow: true } } : base;
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const cat = await prisma.articleCategory.findUnique({ where: { slug } });
  if (!cat) notFound();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const [list, categories] = await Promise.all([listPublicArticles({ page, categorySlug: cat.slug }), publicCategories()]);
  return (
    <>
      <nav aria-label="Breadcrumb" className="border-b border-line bg-white">
        <ol className="container-site flex flex-wrap gap-2 py-3">
          <li>
            <Link href="/">Home</Link> <span aria-hidden="true">/</span>
          </li>
          <li>
            <Link href="/tech-tips">Tech Tips</Link> <span aria-hidden="true">/</span>
          </li>
          <li aria-current="page">{cat.name}</li>
        </ol>
      </nav>
      <PageIntro eyebrow="Tech Tips" title={cat.name}>
        {cat.description && <p>{cat.description}</p>}
      </PageIntro>
      <div className="container-site py-10 md:py-12">
        <div className="space-y-6">
          <SearchForm />
          <CategoryNav categories={categories} active={cat.slug} />
        </div>
        {list.items.length === 0 ? (
          <div className="mt-10">
            <EmptyState title="No tips in this topic yet">
              <Link href="/tech-tips">Browse all Tech Tips</Link>
            </EmptyState>
          </div>
        ) : (
          <section aria-label={`${cat.name} articles`} className="mt-10">
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {list.items.map((a) => (
                <li key={a.id}>
                  <ArticleCard article={a} headingLevel={2} />
                </li>
              ))}
            </ul>
            <Pagination page={list.page} pages={list.pages} hrefFor={(p) => `/tech-tips/category/${cat.slug}${p > 1 ? `?page=${p}` : ""}`} />
          </section>
        )}
      </div>
    </>
  );
}
