import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { isPubliclyVisible, relatedArticles, renderArticleHtml } from "@/lib/articles/service";
import { formatDateTime } from "@/lib/time";
import { absoluteUrl } from "../../../_lib/seo";
import { ArticleView } from "../../_components/ArticleView";

export const metadata: Metadata = { title: "Article Preview", robots: { index: false, follow: false } };

/** Admin-only preview of any article, including drafts and scheduled articles. */
export default async function ArticlePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission("website:manage", `/tech-tips/preview/${id}`);
  const article = await prisma.article.findUnique({ where: { id }, include: { category: true, featuredImage: true } });
  if (!article) notFound();
  const [html, related] = await Promise.all([renderArticleHtml(article.content), relatedArticles(article, 3)]);
  const live = isPubliclyVisible(article);
  return (
    <>
      <div role="status" className="border-b-4 border-warn bg-warn-light">
        <div className="container-site flex flex-wrap items-center justify-between gap-3 py-3 text-warn">
          <p className="font-semibold">
            Preview only.{" "}
            {live
              ? "This article is published."
              : article.status === "SCHEDULED" && article.scheduledFor
                ? `Scheduled to publish ${formatDateTime(article.scheduledFor)}. Visitors cannot see it yet.`
                : "This is a draft. Visitors cannot see it."}
          </p>
          <Link href={`/admin/tech-tips/${article.id}`} className="font-semibold text-warn">
            Back to the editor
          </Link>
        </div>
      </div>
      <ArticleView article={article} html={html} related={related} shareUrl={absoluteUrl(`/tech-tips/${article.slug}`)} dateOverride={article.publishedAt ?? article.scheduledFor ?? article.updatedAt} />
    </>
  );
}
