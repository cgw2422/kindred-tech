import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { ArticleForm } from "../ArticleForm";
import { formValues } from "../form-values";

export const metadata = { title: "New Tech Tip" };

export default async function NewArticlePage() {
  await requirePermission("website:manage", "/admin/tech-tips/new");
  const [categories, biz] = await Promise.all([prisma.articleCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }), getSettings("business")]);
  return (
    <div>
      <p className="mb-2">
        <Link href="/admin/tech-tips">Back to Tech Tips</Link>
      </p>
      <PageHeader title="New article" />
      <ArticleForm values={await formValues(null, biz.timeZone)} categories={categories} />
    </div>
  );
}
