import type { Article, ArticleStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../audit";
import { assetRenderable, type RenderableImage } from "../media/service";
import { srcSet, variantUrl, fallbackWidth } from "../media/urls";
import { inlineMediaIds, sanitizeArticleHtml, slugify } from "./html";

export class ArticleError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = "ArticleError";
  }
}

export const PAGE_SIZE = 12;

/**
 * Public visibility: published, or scheduled with a publication time that has passed.
 * Scheduling stores the go-live time in publishedAt, so articles appear on time even
 * if the background worker is delayed (the worker then marks them PUBLISHED).
 */
export function publicWhere(now = new Date()): Prisma.ArticleWhereInput {
  return { status: { in: ["PUBLISHED", "SCHEDULED"] }, publishedAt: { lte: now } };
}

export function isPubliclyVisible(a: Pick<Article, "status" | "publishedAt">, now = new Date()) {
  return (a.status === "PUBLISHED" || a.status === "SCHEDULED") && a.publishedAt != null && a.publishedAt <= now;
}

const cardSelect = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  publishedAt: true,
  updatedAt: true,
  featured: true,
  featuredImageAlt: true,
  category: { select: { name: true, slug: true } },
  featuredImage: true,
} satisfies Prisma.ArticleSelect;

export type ArticleCard = Prisma.ArticleGetPayload<{ select: typeof cardSelect }>;

export function cardImage(a: ArticleCard): RenderableImage | null {
  return a.featuredImage ? assetRenderable(a.featuredImage, a.featuredImageAlt) : null;
}

export async function listPublicArticles(params: { page?: number; q?: string; categorySlug?: string; now?: Date }) {
  const now = params.now ?? new Date();
  const where: Prisma.ArticleWhereInput = { ...publicWhere(now) };
  const q = params.q?.trim().slice(0, 100);
  if (q) where.AND = [{ OR: [{ title: { contains: q, mode: "insensitive" } }, { excerpt: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }] }];
  if (params.categorySlug) where.category = { slug: params.categorySlug };
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const [total, items] = await Promise.all([
    prisma.article.count({ where }),
    prisma.article.findMany({ where, select: cardSelect, orderBy: [{ publishedAt: "desc" }, { id: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function featuredArticles(limit = 3, now = new Date()) {
  return prisma.article.findMany({ where: { ...publicWhere(now), featured: true }, select: cardSelect, orderBy: { publishedAt: "desc" }, take: limit });
}

export async function latestArticles(limit = 3, now = new Date()) {
  try {
    return await prisma.article.findMany({ where: publicWhere(now), select: cardSelect, orderBy: { publishedAt: "desc" }, take: limit });
  } catch (err) {
    console.error("[articles] could not load latest articles", (err as Error).message);
    return [];
  }
}

export async function publicCategories(now = new Date()) {
  const cats = await prisma.articleCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { articles: { where: publicWhere(now) } } } } });
  return cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug, description: c.description, count: c._count.articles }));
}

export async function getPublicArticle(slug: string, now = new Date()) {
  const a = await prisma.article.findUnique({ where: { slug }, include: { category: true, featuredImage: true } });
  if (!a || !isPubliclyVisible(a, now)) return null;
  return a;
}

export async function relatedArticles(article: { id: string; categoryId: string | null }, limit = 3, now = new Date()) {
  const same = article.categoryId
    ? await prisma.article.findMany({ where: { ...publicWhere(now), categoryId: article.categoryId, id: { not: article.id } }, select: cardSelect, orderBy: { publishedAt: "desc" }, take: limit })
    : [];
  if (same.length >= limit) return same;
  const more = await prisma.article.findMany({
    where: { ...publicWhere(now), id: { notIn: [article.id, ...same.map((s) => s.id)] } },
    select: cardSelect,
    orderBy: { publishedAt: "desc" },
    take: limit - same.length,
  });
  return [...same, ...more];
}

/** Replaces <img data-media-id> placeholders with responsive <picture> markup. */
export async function renderArticleHtml(content: string): Promise<string> {
  const ids = inlineMediaIds(content);
  const assets = ids.length ? await prisma.mediaAsset.findMany({ where: { id: { in: ids } } }) : [];
  return content.replace(/<img\b[^>]*>/gi, (tag) => {
    const id = /data-media-id="([a-z0-9]+)"/i.exec(tag)?.[1];
    const altAttr = /alt="([^"]*)"/i.exec(tag)?.[1];
    const asset = assets.find((x) => x.id === id);
    if (!asset) return "";
    const r = assetRenderable(asset, altAttr ? altAttr.replace(/&quot;/g, '"').replace(/&amp;/g, "&") : null);
    const sizes = "(min-width: 768px) 720px, 100vw";
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    return `<picture><source type="image/webp" srcset="${srcSet(r.assetId, r.tag, r.width, "webp")}" sizes="${sizes}"><img src="${variantUrl(r.assetId, r.tag, fallbackWidth(r.width), "jpg")}" srcset="${srcSet(r.assetId, r.tag, r.width, "jpg")}" sizes="${sizes}" alt="${esc(r.alt)}" width="${r.width}" height="${r.height}" loading="lazy" decoding="async"></picture>`;
  });
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const articleInputSchema = z.object({
  title: z.string().trim().min(3, "Please enter a title.").max(160, "Please keep the title under 160 characters."),
  slug: z.string().trim().max(80),
  excerpt: z.string().trim().max(300, "Please keep the summary under 300 characters."),
  content: z.string().max(400_000, "The article is too long."),
  categoryId: z.string().trim(),
  featuredImageId: z.string().trim(),
  featuredImageAlt: z.string().trim().max(300),
  seoTitle: z.string().trim().max(70, "SEO titles should be 70 characters or fewer."),
  metaDescription: z.string().trim().max(170, "Meta descriptions should be 170 characters or fewer."),
  featured: z.boolean(),
});
export type ArticleInput = z.infer<typeof articleInputSchema>;

export type PublishIntent = "draft" | "publish" | "schedule" | "unpublish" | "keep";

/** Slugs used by Tech Tips routes, so they can never be article URLs. */
const RESERVED_SLUGS = ["category", "preview", "page", "search"];

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base) || "article";
  let candidate = RESERVED_SLUGS.includes(root) ? `${root}-article` : root;
  for (let i = 2; i < 200; i++) {
    const clash = await prisma.article.findFirst({ where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
    if (!clash) return candidate;
    candidate = `${root}-${i}`.slice(0, 80);
  }
  throw new ArticleError("Could not find an unused URL slug.", "slug");
}

function statusFields(intent: PublishIntent, existing: Pick<Article, "status" | "publishedAt" | "scheduledFor"> | null, scheduleAt: Date | null, now: Date) {
  switch (intent) {
    case "draft":
    case "unpublish":
      return { status: "DRAFT" as ArticleStatus, scheduledFor: null, publishedAt: intent === "unpublish" ? null : existing?.status === "DRAFT" ? null : (existing?.publishedAt ?? null) };
    case "publish":
      return { status: "PUBLISHED" as ArticleStatus, scheduledFor: null, publishedAt: existing?.status === "PUBLISHED" && existing.publishedAt ? existing.publishedAt : now };
    case "schedule":
      if (!scheduleAt || Number.isNaN(scheduleAt.getTime())) throw new ArticleError("Please choose a date and time to publish.", "scheduleAt");
      if (scheduleAt.getTime() <= now.getTime()) throw new ArticleError("The scheduled time must be in the future. To publish now, choose Publish.", "scheduleAt");
      return { status: "SCHEDULED" as ArticleStatus, scheduledFor: scheduleAt, publishedAt: scheduleAt };
    default:
      return {};
  }
}

export async function saveArticle(params: { id?: string | null; input: ArticleInput; intent: PublishIntent; scheduleAt?: Date | null; actorUserId?: string | null; now?: Date }) {
  const now = params.now ?? new Date();
  const v = articleInputSchema.parse(params.input);
  const existing = params.id ? await prisma.article.findUnique({ where: { id: params.id } }) : null;
  if (params.id && !existing) throw new ArticleError("That article no longer exists.");

  const content = sanitizeArticleHtml(v.content);
  if ((params.intent === "publish" || params.intent === "schedule") && content.replace(/<[^>]+>/g, "").trim().length < 50) {
    throw new ArticleError("Please add the article content before publishing.", "content");
  }
  const slug = await uniqueSlug(v.slug || v.title, existing?.id);
  if (v.slug && slugify(v.slug) !== slug) {
    throw new ArticleError(`The URL slug "${slugify(v.slug)}" is already used by another article.`, "slug");
  }
  const [category, image] = await Promise.all([
    v.categoryId ? prisma.articleCategory.findUnique({ where: { id: v.categoryId } }) : null,
    v.featuredImageId ? prisma.mediaAsset.findUnique({ where: { id: v.featuredImageId } }) : null,
  ]);
  if (v.categoryId && !category) throw new ArticleError("Please choose a valid category.", "categoryId");
  if (v.featuredImageId && !image) throw new ArticleError("The selected featured image no longer exists.", "featuredImageId");

  const data = {
    title: v.title,
    slug,
    excerpt: v.excerpt,
    content,
    categoryId: category?.id ?? null,
    featuredImageId: image?.id ?? null,
    featuredImageAlt: v.featuredImageAlt || null,
    seoTitle: v.seoTitle || null,
    metaDescription: v.metaDescription || null,
    featured: v.featured,
    ...statusFields(params.intent, existing, params.scheduleAt ?? null, now),
  };
  const saved = existing
    ? await prisma.article.update({ where: { id: existing.id }, data })
    : await prisma.article.create({ data: { ...data, status: data.status ?? "DRAFT", authorId: params.actorUserId ?? null } });
  await audit({ actorUserId: params.actorUserId, action: existing ? "article.updated" : "article.created", entityType: "Article", entityId: saved.id, metadata: { status: saved.status, intent: params.intent } });
  return saved;
}

export async function setArticlesStatus(ids: string[], action: "publish" | "unpublish", actorUserId?: string | null, now = new Date()) {
  const list = await prisma.article.findMany({ where: { id: { in: ids } } });
  let changed = 0;
  const skipped: string[] = [];
  for (const a of list) {
    if (action === "publish") {
      if (a.content.replace(/<[^>]+>/g, "").trim().length < 50) {
        skipped.push(a.title);
        continue;
      }
      if (a.status === "PUBLISHED") continue;
      await prisma.article.update({ where: { id: a.id }, data: { status: "PUBLISHED", scheduledFor: null, publishedAt: now } });
    } else {
      if (a.status === "DRAFT") continue;
      await prisma.article.update({ where: { id: a.id }, data: { status: "DRAFT", scheduledFor: null, publishedAt: null } });
    }
    changed++;
  }
  await audit({ actorUserId, action: `article.bulk_${action}`, entityType: "Article", metadata: { changed, requested: ids.length } });
  return { changed, skipped };
}

export async function duplicateArticle(id: string, actorUserId?: string | null) {
  const a = await prisma.article.findUniqueOrThrow({ where: { id } });
  const copy = await prisma.article.create({
    data: {
      title: `${a.title} (copy)`.slice(0, 160),
      slug: await uniqueSlug(`${a.slug}-copy`),
      excerpt: a.excerpt,
      content: a.content,
      categoryId: a.categoryId,
      featuredImageId: a.featuredImageId,
      featuredImageAlt: a.featuredImageAlt,
      seoTitle: a.seoTitle,
      metaDescription: a.metaDescription,
      featured: false,
      status: "DRAFT",
      authorId: actorUserId ?? null,
    },
  });
  await audit({ actorUserId, action: "article.duplicated", entityType: "Article", entityId: copy.id, metadata: { from: id } });
  return copy;
}

export async function deleteArticle(id: string, actorUserId?: string | null) {
  await prisma.article.delete({ where: { id } });
  await audit({ actorUserId, action: "article.deleted", entityType: "Article", entityId: id });
}

/** Marks scheduled articles whose time has come as PUBLISHED. Safe to run repeatedly. */
export async function publishDueScheduled(now = new Date()) {
  const res = await prisma.article.updateMany({ where: { status: "SCHEDULED", scheduledFor: { lte: now } }, data: { status: "PUBLISHED" } });
  return { published: res.count };
}

export async function listAdminArticles(params: { q?: string; status?: string; categoryId?: string; featured?: boolean }) {
  const where: Prisma.ArticleWhereInput = {};
  const q = params.q?.trim();
  if (q) where.OR = [{ title: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }, { excerpt: { contains: q, mode: "insensitive" } }];
  if (params.status === "DRAFT" || params.status === "SCHEDULED" || params.status === "PUBLISHED") where.status = params.status;
  if (params.categoryId) where.categoryId = params.categoryId;
  if (params.featured) where.featured = true;
  return prisma.article.findMany({ where, include: { category: true, featuredImage: true }, orderBy: [{ updatedAt: "desc" }], take: 300 });
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function saveCategory(params: { id?: string | null; name: string; slug?: string; description?: string; sortOrder?: number; actorUserId?: string | null }) {
  const name = params.name.trim();
  if (name.length < 2) throw new ArticleError("Please enter a category name.", "name");
  const slug = slugify(params.slug || name);
  if (!slug) throw new ArticleError("Please enter a valid slug.", "slug");
  const clash = await prisma.articleCategory.findFirst({ where: { slug, ...(params.id ? { id: { not: params.id } } : {}) } });
  if (clash) throw new ArticleError("Another category already uses that slug.", "slug");
  const data = { name: name.slice(0, 80), slug, description: params.description?.trim().slice(0, 300) || null, sortOrder: params.sortOrder ?? 0 };
  const c = params.id ? await prisma.articleCategory.update({ where: { id: params.id }, data }) : await prisma.articleCategory.create({ data });
  await audit({ actorUserId: params.actorUserId, action: params.id ? "article_category.updated" : "article_category.created", entityType: "ArticleCategory", entityId: c.id });
  return c;
}

export async function deleteCategory(id: string, actorUserId?: string | null) {
  const count = await prisma.article.count({ where: { categoryId: id } });
  if (count > 0) throw new ArticleError(`This category has ${count} article${count === 1 ? "" : "s"}. Move them to another category first.`);
  await prisma.articleCategory.delete({ where: { id } });
  await audit({ actorUserId, action: "article_category.deleted", entityType: "ArticleCategory", entityId: id });
}
