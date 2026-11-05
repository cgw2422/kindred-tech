import Link from "next/link";
import { cardImage, type ArticleCard as Card } from "@/lib/articles/service";
import { ResponsiveImage } from "@/components/media/ResponsiveImage";
import { BrandedImageFallback } from "@/components/media/BrandedImageFallback";
import { formatDate } from "@/lib/time";

export function ArticleCard({ article, headingLevel = 3, priority = false }: { article: Card; headingLevel?: 2 | 3; priority?: boolean }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  const img = cardImage(article);
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-line bg-white transition-colors hover:border-navy">
      {img ? (
        <ResponsiveImage image={{ ...img, alt: "" }} aspect={16 / 9} sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw" priority={priority} rounded={false} />
      ) : (
        <BrandedImageFallback label={article.category?.name} className="rounded-none border-0 border-b" />
      )}
      <div className="flex flex-1 flex-col p-5">
        {article.category && <p className="text-sm font-semibold uppercase tracking-wider text-green-dark">{article.category.name}</p>}
        <H className="mt-1 text-xl">
          <Link href={`/tech-tips/${article.slug}`} className="no-underline after:absolute after:inset-0 group-hover:underline">
            {article.title}
          </Link>
        </H>
        <p className="mt-2 flex-1">{article.excerpt}</p>
        {article.publishedAt && (
          <p className="mt-4 text-body">
            <time dateTime={article.publishedAt.toISOString()}>{formatDate(article.publishedAt, undefined, { weekday: undefined })}</time>
          </p>
        )}
      </div>
    </article>
  );
}
