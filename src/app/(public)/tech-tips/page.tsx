import type { Metadata } from "next";
import { EmptyState } from "@/components/ui";
import { featuredArticles, listPublicArticles, publicCategories } from "@/lib/articles/service";
import { CtaBand, PageIntro } from "../_components/Blocks";
import { pageMetadata } from "../_lib/seo";
import { ArticleCard } from "./_components/ArticleCard";
import { Pagination } from "./_components/Pagination";
import { CategoryNav, SearchForm } from "./_components/TipsSidebar";

type Props = { searchParams: Promise<{ q?: string; page?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const base = pageMetadata({
    path: "/tech-tips",
    title: "Tech Tips: Plain-Language Technology Help for Seniors",
    description:
      "Easy-to-follow technology tips for seniors and families: smartphones, computers, Wi-Fi, smart TVs, passwords, and how to spot scams. From Kindred Tech Support in Ohio.",
  });
  // Search results and deep pages are not separate content for search engines.
  if (sp.q || (sp.page && sp.page !== "1")) return { ...base, robots: { index: false, follow: true } };
  return base;
}

export default async function TechTipsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const [list, featured, categories] = await Promise.all([listPublicArticles({ page, q }), q || page > 1 ? Promise.resolve([]) : featuredArticles(3), publicCategories()]);
  const featuredIds = new Set(featured.map((f) => f.id));
  const recent = q ? list.items : list.items.filter((a) => page > 1 || !featuredIds.has(a.id));
  const hrefFor = (p: number) => `/tech-tips?${new URLSearchParams({ ...(q ? { q } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <>
      <PageIntro eyebrow="Tech Tips" title="Helpful technology tips in plain language">
        <p>Clear, step-by-step answers to everyday technology questions, from making text bigger on your phone to spotting a scam before it costs you.</p>
      </PageIntro>

      <div className="container-site py-10 md:py-12">
        <div className="space-y-6">
          <SearchForm q={q} />
          <CategoryNav categories={categories} />
        </div>

        {q && (
          <p role="status" className="mt-8 text-lg">
            {list.total === 0 ? `No tips match "${q}". Try a different word, or browse by topic.` : `${list.total} tip${list.total === 1 ? "" : "s"} found for "${q}".`}
          </p>
        )}

        {featured.length > 0 && (
          <section aria-labelledby="featured-title" className="mt-12">
            <h2 id="featured-title" className="text-2xl md:text-3xl">
              Featured tips
            </h2>
            <ul className="mt-6 grid gap-6 md:grid-cols-3">
              {featured.map((a, i) => (
                <li key={a.id}>
                  <ArticleCard article={a} priority={i === 0} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {list.total === 0 && !q ? (
          <div className="mt-12">
            <EmptyState title="New tips are on the way">Please check back soon.</EmptyState>
          </div>
        ) : (
          recent.length > 0 && (
            <section aria-labelledby="recent-title" className="mt-12">
              <h2 id="recent-title" className="text-2xl md:text-3xl">
                {q ? "Search results" : page > 1 ? `Recent tips, page ${page}` : "Recently published"}
              </h2>
              <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {recent.map((a) => (
                  <li key={a.id}>
                    <ArticleCard article={a} />
                  </li>
                ))}
              </ul>
              <Pagination page={list.page} pages={list.pages} hrefFor={hrefFor} />
            </section>
          )
        )}
      </div>

      <CtaBand title="Still Need a Hand?" secondary={{ href: "/contact", label: "Contact Kindred" }}>
        Technology can be frustrating, but you don&apos;t have to figure everything out on your own. Kindred Tech Support provides patient, personalized assistance with
        everyday technology.
      </CtaBand>
    </>
  );
}
