import type { MetadataRoute } from "next";
import { SERVICE_PAGES } from "./(public)/services/content";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { publicWhere } from "@/lib/articles/service";

// Includes published Tech Tips, so it is generated per request.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.appUrl;
  const entries: { path: string; priority: number; changeFrequency: "weekly" | "monthly" | "yearly"; lastModified?: Date }[] = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/services", priority: 0.9, changeFrequency: "monthly" },
    ...SERVICE_PAGES.map((p) => ({ path: `/services/${p.slug}`, priority: 0.8, changeFrequency: "monthly" as const })),
    { path: "/senior-living", priority: 0.8, changeFrequency: "monthly" },
    { path: "/pricing", priority: 0.8, changeFrequency: "monthly" },
    { path: "/schedule", priority: 0.8, changeFrequency: "monthly" },
    { path: "/service-areas", priority: 0.7, changeFrequency: "monthly" },
    { path: "/tech-tips", priority: 0.7, changeFrequency: "weekly" },
    { path: "/about", priority: 0.6, changeFrequency: "yearly" },
    { path: "/contact", priority: 0.6, changeFrequency: "yearly" },
    { path: "/faq", priority: 0.6, changeFrequency: "monthly" },
    { path: "/accessibility", priority: 0.3, changeFrequency: "yearly" },
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
    { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  ];
  try {
    const now = new Date();
    const [articles, categories] = await Promise.all([
      prisma.article.findMany({ where: publicWhere(now), select: { slug: true, updatedAt: true }, orderBy: { publishedAt: "desc" } }),
      prisma.articleCategory.findMany({ where: { articles: { some: publicWhere(now) } }, select: { slug: true } }),
    ]);
    entries.push(
      ...categories.map((c) => ({ path: `/tech-tips/category/${c.slug}`, priority: 0.5, changeFrequency: "weekly" as const })),
      ...articles.map((a) => ({ path: `/tech-tips/${a.slug}`, priority: 0.6, changeFrequency: "monthly" as const, lastModified: a.updatedAt })),
    );
  } catch (err) {
    console.error("[sitemap] could not load articles", (err as Error).message);
  }
  return entries.map((e) => ({ url: e.path === "/" ? `${base}/` : `${base}${e.path}`, changeFrequency: e.changeFrequency, priority: e.priority, ...(e.lastModified ? { lastModified: e.lastModified } : {}) }));
}
