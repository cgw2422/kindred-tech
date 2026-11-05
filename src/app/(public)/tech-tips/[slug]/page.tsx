import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicArticle, relatedArticles, renderArticleHtml } from "@/lib/articles/service";
import { getSettings } from "@/lib/settings";
import { env } from "@/lib/env";
import { assetRenderable } from "@/lib/media/service";
import { variantUrl } from "@/lib/media/urls";
import { JsonLd } from "../../_components/JsonLd";
import { absoluteUrl } from "../../_lib/seo";
import { ArticleView } from "../_components/ArticleView";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const a = await getPublicArticle(slug);
  if (!a) return { title: "Tip Not Found", robots: { index: false } };
  const title = a.seoTitle || a.title;
  const description = a.metaDescription || a.excerpt;
  const path = `/tech-tips/${a.slug}`;
  const img = a.featuredImage ? assetRenderable(a.featuredImage, a.featuredImageAlt) : null;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      title,
      description,
      url: path,
      siteName: "Kindred Tech Support",
      publishedTime: a.publishedAt?.toISOString(),
      modifiedTime: a.updatedAt.toISOString(),
      section: a.category?.name,
      images: img ? [{ url: variantUrl(img.assetId, img.tag, 1200, "jpg"), alt: img.alt }] : undefined,
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getPublicArticle(slug);
  if (!article) notFound();
  const [html, related, business] = await Promise.all([renderArticleHtml(article.content), relatedArticles(article, 3), getSettings("business")]);
  const url = absoluteUrl(`/tech-tips/${article.slug}`);
  const img = article.featuredImage ? assetRenderable(article.featuredImage, article.featuredImageAlt) : null;
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: article.title.slice(0, 110),
          description: article.metaDescription || article.excerpt,
          datePublished: article.publishedAt?.toISOString(),
          dateModified: article.updatedAt.toISOString(),
          mainEntityOfPage: url,
          articleSection: article.category?.name,
          image: img ? [`${env.appUrl}${variantUrl(img.assetId, img.tag, 1200, "jpg")}`] : undefined,
          author: { "@type": "Organization", name: business.name, url: env.appUrl },
          publisher: { "@type": "Organization", "@id": `${env.appUrl}/#business`, name: business.name, logo: { "@type": "ImageObject", url: `${env.appUrl}/icon-512.png` } },
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
            { "@type": "ListItem", position: 2, name: "Tech Tips", item: absoluteUrl("/tech-tips") },
            ...(article.category ? [{ "@type": "ListItem", position: 3, name: article.category.name, item: absoluteUrl(`/tech-tips/category/${article.category.slug}`) }] : []),
            { "@type": "ListItem", position: article.category ? 4 : 3, name: article.title, item: url },
          ],
        }}
      />
      <ArticleView article={article} html={html} related={related} shareUrl={url} />
    </>
  );
}
