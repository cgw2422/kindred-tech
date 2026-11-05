import Link from "next/link";
import type { Article, ArticleCategory, MediaAsset } from "@prisma/client";
import { ButtonLink } from "@/components/ui";
import { ResponsiveImage } from "@/components/media/ResponsiveImage";
import { assetRenderable } from "@/lib/media/service";
import { readingMinutes } from "@/lib/articles/html";
import type { ArticleCard as Card } from "@/lib/articles/service";
import { formatDate } from "@/lib/time";
import { ArticleCard } from "./ArticleCard";
import { ShareLinks } from "./ShareLinks";

export function ArticleView({
  article,
  html,
  related,
  shareUrl,
  dateOverride,
}: {
  article: Article & { category: ArticleCategory | null; featuredImage: MediaAsset | null };
  html: string;
  related: Card[];
  shareUrl: string;
  dateOverride?: Date | null;
}) {
  const date = dateOverride ?? article.publishedAt;
  const img = article.featuredImage ? assetRenderable(article.featuredImage, article.featuredImageAlt) : null;
  return (
    <>
      <nav aria-label="Breadcrumb" className="no-print border-b border-line bg-white">
        <ol className="container-site flex flex-wrap gap-2 py-3">
          <li>
            <Link href="/">Home</Link> <span aria-hidden="true">/</span>
          </li>
          <li>
            <Link href="/tech-tips">Tech Tips</Link> <span aria-hidden="true">/</span>
          </li>
          {article.category && (
            <li>
              <Link href={`/tech-tips/category/${article.category.slug}`}>{article.category.name}</Link> <span aria-hidden="true">/</span>
            </li>
          )}
          <li aria-current="page" className="text-body">
            {article.title}
          </li>
        </ol>
      </nav>

      <article className="container-site py-10 md:py-14">
        <header className="mx-auto max-w-[46rem]">
          {article.category && (
            <p className="text-sm font-semibold uppercase tracking-wider text-green-dark">
              <Link href={`/tech-tips/category/${article.category.slug}`} className="text-green-dark no-underline hover:underline">
                {article.category.name}
              </Link>
            </p>
          )}
          <h1 className="mt-2 text-3xl md:text-[2.5rem]">{article.title}</h1>
          {article.excerpt && <p className="mt-4 text-xl">{article.excerpt}</p>}
          <p className="mt-4 text-body">
            {date && (
              <>
                <time dateTime={date.toISOString()}>{formatDate(date, undefined, { weekday: undefined })}</time>
                <span aria-hidden="true"> · </span>
              </>
            )}
            {readingMinutes(article.content)} minute read
          </p>
        </header>

        {img && (
          <div className="mx-auto mt-8 max-w-[60rem]">
            <ResponsiveImage image={img} aspect={16 / 9} mobileAspect={4 / 3} sizes="(min-width: 1024px) 960px, 100vw" priority />
          </div>
        )}

        <div className="prose-kindred article-body mx-auto mt-10 max-w-[46rem] text-[1.08rem] leading-[1.75]" dangerouslySetInnerHTML={{ __html: html }} />

        <aside aria-labelledby="still-need-hand" className="no-print mx-auto mt-12 max-w-[46rem] rounded-lg border border-line bg-soft p-6 md:p-8">
          <h2 id="still-need-hand" className="text-2xl">
            Still Need a Hand?
          </h2>
          <p className="mt-3 text-lg">
            Technology can be frustrating, but you don&apos;t have to figure everything out on your own. Kindred Tech Support provides patient, personalized assistance with
            everyday technology.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
            <ButtonLink href="/schedule">Schedule a Visit</ButtonLink>
            <Link href="/contact" className="inline-flex min-h-[44px] items-center font-semibold">
              Contact Kindred
            </Link>
          </div>
        </aside>

        <div className="no-print mx-auto mt-10 max-w-[46rem]">
          <ShareLinks url={shareUrl} title={article.title} />
        </div>
      </article>

      {related.length > 0 && (
        <section aria-labelledby="related-title" className="no-print border-t border-line bg-white">
          <div className="container-site py-12">
            <h2 id="related-title" className="text-2xl md:text-3xl">
              Related tips
            </h2>
            <ul className="mt-6 grid gap-6 md:grid-cols-3">
              {related.map((r) => (
                <li key={r.id}>
                  <ArticleCard article={r} />
                </li>
              ))}
            </ul>
            <p className="mt-6">
              <Link href="/tech-tips" className="font-semibold">
                View all Tech Tips
              </Link>
            </p>
          </div>
        </section>
      )}
    </>
  );
}
