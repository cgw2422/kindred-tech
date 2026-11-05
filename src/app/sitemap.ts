import type { MetadataRoute } from "next";
import { SERVICE_PAGES } from "./(public)/services/content";
import { env } from "@/lib/env";

/** Static list of public marketing URLs (no database access needed). */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.appUrl;
  const entries: { path: string; priority: number; changeFrequency: "weekly" | "monthly" | "yearly" }[] = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/services", priority: 0.9, changeFrequency: "monthly" },
    ...SERVICE_PAGES.map((p) => ({ path: `/services/${p.slug}`, priority: 0.8, changeFrequency: "monthly" as const })),
    { path: "/senior-living", priority: 0.8, changeFrequency: "monthly" },
    { path: "/pricing", priority: 0.8, changeFrequency: "monthly" },
    { path: "/schedule", priority: 0.8, changeFrequency: "monthly" },
    { path: "/service-areas", priority: 0.7, changeFrequency: "monthly" },
    { path: "/about", priority: 0.6, changeFrequency: "yearly" },
    { path: "/contact", priority: 0.6, changeFrequency: "yearly" },
    { path: "/faq", priority: 0.6, changeFrequency: "monthly" },
    { path: "/accessibility", priority: 0.3, changeFrequency: "yearly" },
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
    { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  ];
  return entries.map((e) => ({ url: e.path === "/" ? `${base}/` : `${base}${e.path}`, changeFrequency: e.changeFrequency, priority: e.priority }));
}
