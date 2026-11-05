import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/forms";
import { readFlash } from "@/lib/admin-helpers";
import { wordCount } from "@/lib/articles/html";
import { ArticleForm } from "../ArticleForm";
import { formValues } from "../form-values";
import { deleteArticleAction, duplicateArticleAction } from "../actions";

export const metadata = { title: "Edit Tech Tip" };

export default async function EditArticlePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("website:manage", "/admin/tech-tips");
  const { id } = await params;
  const flash = readFlash(await searchParams);
  const [article, categories, biz] = await Promise.all([
    prisma.article.findUnique({ where: { id }, include: { featuredImage: true } }),
    prisma.articleCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    getSettings("business"),
  ]);
  if (!article) notFound();
  return (
    <div>
      <p className="mb-2">
        <Link href="/admin/tech-tips">Back to Tech Tips</Link>
      </p>
      <PageHeader
        title={article.title}
        description={`${wordCount(article.content)} words`}
        actions={
          <div className="flex flex-wrap gap-2">
            <form action={duplicateArticleAction}>
              <input type="hidden" name="id" value={article.id} />
              <SubmitButton variant="outline" size="sm">
                Duplicate
              </SubmitButton>
            </form>
            <form action={deleteArticleAction}>
              <input type="hidden" name="id" value={article.id} />
              <SubmitButton variant="danger" size="sm" confirm="Delete this article permanently? This cannot be undone.">
                Delete
              </SubmitButton>
            </form>
          </div>
        }
      />
      <Flash flash={flash} />
      <ArticleForm key={article.updatedAt.toISOString()} values={await formValues(article, biz.timeZone)} categories={categories} />
    </div>
  );
}
