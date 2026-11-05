"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { fd, fdBool, success, type ActionState } from "@/lib/forms";
import { getSettings } from "@/lib/settings";
import { localMinuteToUtc } from "@/lib/time";
import { flashRedirect } from "@/lib/admin-helpers";
import {
  ArticleError,
  articleInputSchema,
  deleteArticle,
  deleteCategory,
  duplicateArticle,
  saveArticle,
  saveCategory,
  setArticlesStatus,
  type PublishIntent,
} from "@/lib/articles/service";

function revalidateTips(slug?: string) {
  revalidatePath("/tech-tips");
  revalidatePath("/");
  revalidatePath("/sitemap.xml");
  if (slug) revalidatePath(`/tech-tips/${slug}`);
  revalidatePath("/admin/tech-tips");
}

async function parseSchedule(value: string): Promise<Date | null> {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const tz = (await getSettings("business")).timeZone;
  return localMinuteToUtc(m[1], Number(m[2]) * 60 + Number(m[3]), tz);
}

export async function saveArticleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("website:manage");
  const id = fd(formData, "id") || null;
  const intentRaw = fd(formData, "intent");
  const intent: PublishIntent = (["draft", "publish", "schedule", "unpublish", "keep"] as const).find((i) => i === intentRaw) ?? "draft";
  const parsed = articleInputSchema.safeParse({
    title: fd(formData, "title"),
    slug: fd(formData, "slug"),
    excerpt: fd(formData, "excerpt"),
    content: String(formData.get("content") ?? ""),
    categoryId: fd(formData, "categoryId"),
    featuredImageId: fd(formData, "featuredImageId"),
    featuredImageAlt: fd(formData, "featuredImageAlt"),
    seoTitle: fd(formData, "seoTitle"),
    metaDescription: fd(formData, "metaDescription"),
    featured: fdBool(formData, "featured"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors };
  }
  let saved;
  try {
    saved = await saveArticle({ id, input: parsed.data, intent, scheduleAt: intent === "schedule" ? await parseSchedule(fd(formData, "scheduleAt")) : null, actorUserId: user.id });
  } catch (err) {
    if (err instanceof ArticleError) return { ok: false, error: err.message, fieldErrors: err.field ? { [err.field]: err.message } : undefined };
    throw err;
  }
  revalidateTips(saved.slug);
  const messages: Record<PublishIntent, string> = {
    draft: "Draft saved. It is not visible on the website.",
    publish: "Published. The article is live on the website.",
    schedule: "Scheduled. The article will appear on the website at the chosen time.",
    unpublish: "Unpublished. The article is now a draft and hidden from the website.",
    keep: "Changes saved.",
  };
  if (!id) redirect(`/admin/tech-tips/${saved.id}?ok=${encodeURIComponent(messages[intent])}`);
  return success(messages[intent], { status: saved.status, slug: saved.slug });
}

export async function bulkArticlesAction(formData: FormData) {
  const user = await requirePermission("website:manage");
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  const action = fd(formData, "bulk") === "unpublish" ? "unpublish" : "publish";
  if (ids.length === 0) flashRedirect("/admin/tech-tips", "error", "Select at least one article first.");
  const r = await setArticlesStatus(ids, action, user.id);
  revalidateTips();
  const skipped = r.skipped.length ? ` ${r.skipped.length} skipped because they have no content.` : "";
  flashRedirect("/admin/tech-tips", "ok", `${r.changed} article${r.changed === 1 ? "" : "s"} ${action === "publish" ? "published" : "unpublished"}.${skipped}`);
}

export async function duplicateArticleAction(formData: FormData) {
  const user = await requirePermission("website:manage");
  const copy = await duplicateArticle(fd(formData, "id"), user.id);
  revalidatePath("/admin/tech-tips");
  redirect(`/admin/tech-tips/${copy.id}?ok=${encodeURIComponent("Copy created as a draft.")}`);
}

export async function deleteArticleAction(formData: FormData) {
  const user = await requirePermission("website:manage");
  await deleteArticle(fd(formData, "id"), user.id);
  revalidateTips();
  flashRedirect("/admin/tech-tips", "ok", "Article deleted.");
}

export async function saveCategoryAction(formData: FormData) {
  const user = await requirePermission("website:manage");
  try {
    await saveCategory({
      id: fd(formData, "id") || null,
      name: fd(formData, "name"),
      slug: fd(formData, "slug"),
      description: fd(formData, "description"),
      sortOrder: parseInt(fd(formData, "sortOrder"), 10) || 0,
      actorUserId: user.id,
    });
  } catch (err) {
    if (err instanceof ArticleError) flashRedirect("/admin/tech-tips/categories", "error", err.message);
    throw err;
  }
  revalidateTips();
  flashRedirect("/admin/tech-tips/categories", "ok", "Category saved.");
}

export async function deleteCategoryAction(formData: FormData) {
  const user = await requirePermission("website:manage");
  try {
    await deleteCategory(fd(formData, "id"), user.id);
  } catch (err) {
    if (err instanceof ArticleError) flashRedirect("/admin/tech-tips/categories", "error", err.message);
    throw err;
  }
  revalidateTips();
  flashRedirect("/admin/tech-tips/categories", "ok", "Category deleted.");
}

