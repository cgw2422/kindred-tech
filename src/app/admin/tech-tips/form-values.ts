import type { Article, MediaAsset } from "@prisma/client";
import { prisma } from "@/lib/db";
import { inlineMediaIds } from "@/lib/articles/html";
import { assetTag, variantUrl } from "@/lib/media/urls";
import { toDateKey, zonedParts } from "@/lib/time";
import type { ArticleFormValues } from "./ArticleForm";

/** Adds displayable src attributes to inline images so the editor can show them (removed again on save). */
export async function editorHtml(content: string): Promise<string> {
  const ids = inlineMediaIds(content);
  if (ids.length === 0) return content;
  const assets = await prisma.mediaAsset.findMany({ where: { id: { in: ids } } });
  return content.replace(/<img\b([^>]*)data-media-id="([a-z0-9]+)"([^>]*)>/gi, (tag, a, id, b) => {
    const asset = assets.find((x) => x.id === id);
    if (!asset) return tag;
    return `<img${a}data-media-id="${id}" src="${variantUrl(asset.id, assetTag(asset.version), 960, "webp")}"${b}>`;
  });
}

export function pickerAsset(a: MediaAsset | null) {
  return a ? { id: a.id, name: a.name, altText: a.altText, width: a.width, height: a.height, version: a.version, thumb: variantUrl(a.id, assetTag(a.version), 480, "webp") } : null;
}

export async function formValues(a: (Article & { featuredImage: MediaAsset | null }) | null, tz: string): Promise<ArticleFormValues> {
  const sched = a?.scheduledFor;
  let local = "";
  if (sched) {
    const p = zonedParts(sched, tz);
    local = `${toDateKey(sched, tz)}T${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
  }
  return {
    id: a?.id ?? null,
    title: a?.title ?? "",
    slug: a?.slug ?? "",
    excerpt: a?.excerpt ?? "",
    editorHtml: a ? await editorHtml(a.content) : "<p></p>",
    categoryId: a?.categoryId ?? "",
    featuredImage: pickerAsset(a?.featuredImage ?? null),
    featuredImageAlt: a?.featuredImageAlt ?? "",
    seoTitle: a?.seoTitle ?? "",
    metaDescription: a?.metaDescription ?? "",
    featured: a?.featured ?? false,
    status: a?.status ?? "DRAFT",
    scheduleAtLocal: local,
  };
}
