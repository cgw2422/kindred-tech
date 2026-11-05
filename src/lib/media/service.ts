import type { MediaAsset, PageImage, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { audit } from "../audit";
import { requireStorage, getStorage } from "../storage";
import { croppedSize, ingestImage, MediaValidationError, normalizeCrop, renderVariant, type Crop, type VariantFormat, VARIANT_WIDTHS } from "./process";
import { getSlotDef, PAGE_IMAGE_SLOTS } from "./slots";
import { assetTag, parseTag, slotTag } from "./urls";

export { MediaValidationError };

function masterKey(assetId: string, version: number, ext: string) {
  return `masters/${assetId}/${version}.${ext}`;
}

export function cropOf(x: { cropX: number | null; cropY: number | null; cropW: number | null; cropH: number | null }): Crop | null {
  return normalizeCrop({ x: x.cropX ?? undefined, y: x.cropY ?? undefined, w: x.cropW ?? undefined, h: x.cropH ?? undefined });
}

function cropColumns(c: Crop | null) {
  return { cropX: c?.x ?? null, cropY: c?.y ?? null, cropW: c?.w ?? null, cropH: c?.h ?? null };
}

function displayName(filename: string) {
  return (
    filename
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "Untitled image"
  );
}

// ---------------------------------------------------------------------------
// Create / replace / update / delete
// ---------------------------------------------------------------------------

export async function createAssetFromUpload(params: { buffer: Buffer; filename: string; altText?: string; name?: string; actorUserId?: string | null; source?: string | null; license?: string | null }) {
  const store = requireStorage();
  const img = await ingestImage(params.buffer);
  const asset = await prisma.mediaAsset.create({
    data: {
      name: (params.name ?? displayName(params.filename)).slice(0, 120),
      altText: (params.altText ?? "").slice(0, 300),
      masterKey: "pending",
      originalFilename: params.filename.slice(0, 200),
      mimeType: img.mimeType,
      width: img.width,
      height: img.height,
      sizeBytes: img.buffer.length,
      sha256: img.sha256,
      source: params.source ?? "Uploaded",
      license: params.license ?? null,
      uploadedById: params.actorUserId ?? null,
    },
  });
  const key = masterKey(asset.id, 1, img.ext);
  try {
    await store.put(key, img.buffer, img.mimeType);
  } catch (err) {
    await prisma.mediaAsset.delete({ where: { id: asset.id } });
    throw err;
  }
  const saved = await prisma.mediaAsset.update({ where: { id: asset.id }, data: { masterKey: key } });
  await audit({ actorUserId: params.actorUserId, action: "media.uploaded", entityType: "MediaAsset", entityId: asset.id, metadata: { bytes: img.buffer.length, width: img.width, height: img.height } });
  return saved;
}

/** Replaces the image file of an asset, keeping its id so every page and article using it updates. */
export async function replaceAssetFile(params: { assetId: string; buffer: Buffer; filename: string; actorUserId?: string | null }) {
  const store = requireStorage();
  const current = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: params.assetId } });
  const img = await ingestImage(params.buffer);
  const version = current.version + 1;
  const key = masterKey(current.id, version, img.ext);
  await store.put(key, img.buffer, img.mimeType);
  const updated = await prisma.$transaction(async (tx) => {
    const a = await tx.mediaAsset.update({
      where: { id: current.id },
      data: {
        masterKey: key,
        mimeType: img.mimeType,
        width: img.width,
        height: img.height,
        sizeBytes: img.buffer.length,
        sha256: img.sha256,
        version,
        originalFilename: params.filename.slice(0, 200),
        // A new photo invalidates old crops and focal points.
        ...cropColumns(null),
        focalX: 0.5,
        focalY: 0.5,
      },
    });
    await tx.pageImage.updateMany({ where: { assetId: current.id }, data: { ...cropColumns(null), version: { increment: 1 } } });
    return a;
  });
  await store.delete(current.masterKey).catch(() => undefined);
  await store.deletePrefix(`variants/${current.id}/`).catch(() => undefined);
  await audit({ actorUserId: params.actorUserId, action: "media.replaced", entityType: "MediaAsset", entityId: current.id });
  return updated;
}

export async function updateAssetDetails(params: {
  assetId: string;
  name?: string;
  altText?: string;
  description?: string | null;
  source?: string | null;
  license?: string | null;
  attribution?: string | null;
  actorUserId?: string | null;
}) {
  const data: Prisma.MediaAssetUpdateInput = {};
  if (params.name !== undefined) {
    const n = params.name.trim();
    if (!n) throw new MediaValidationError("Please give the image a name.");
    data.name = n.slice(0, 120);
  }
  if (params.altText !== undefined) data.altText = params.altText.trim().slice(0, 300);
  if (params.description !== undefined) data.description = params.description?.trim().slice(0, 1000) || null;
  if (params.source !== undefined) data.source = params.source?.trim().slice(0, 200) || null;
  if (params.license !== undefined) data.license = params.license?.trim().slice(0, 200) || null;
  if (params.attribution !== undefined) data.attribution = params.attribution?.trim().slice(0, 300) || null;
  const a = await prisma.mediaAsset.update({ where: { id: params.assetId }, data });
  await audit({ actorUserId: params.actorUserId, action: "media.details_updated", entityType: "MediaAsset", entityId: a.id });
  return a;
}

/** Sets the default crop and focal point used wherever the asset appears (articles, cards). */
export async function setAssetCrop(params: { assetId: string; crop: Partial<Crop> | null; focalX?: number; focalY?: number; actorUserId?: string | null }) {
  const crop = normalizeCrop(params.crop);
  const clamp = (v: number | undefined) => (v == null || !Number.isFinite(v) ? 0.5 : Math.min(Math.max(v, 0), 1));
  const a = await prisma.mediaAsset.update({
    where: { id: params.assetId },
    data: { ...cropColumns(crop), focalX: clamp(params.focalX), focalY: clamp(params.focalY), version: { increment: 1 } },
  });
  await getStorage()?.deletePrefix(`variants/${a.id}/a`).catch(() => undefined);
  await audit({ actorUserId: params.actorUserId, action: "media.cropped", entityType: "MediaAsset", entityId: a.id });
  return a;
}

export type AssetUsage = { kind: "slot" | "featured" | "inline"; label: string; href: string };

export async function getAssetUsage(assetId: string): Promise<AssetUsage[]> {
  const [slots, featured, inline] = await Promise.all([
    prisma.pageImage.findMany({ where: { assetId } }),
    prisma.article.findMany({ where: { featuredImageId: assetId }, select: { id: true, title: true } }),
    prisma.article.findMany({ where: { content: { contains: `data-media-id="${assetId}"` } }, select: { id: true, title: true } }),
  ]);
  return [
    ...slots.map((s) => {
      const def = getSlotDef(s.slotKey);
      return { kind: "slot" as const, label: def ? `${def.page}: ${def.label}` : s.slotKey, href: `/admin/page-images/${s.slotKey}` };
    }),
    ...featured.map((a) => ({ kind: "featured" as const, label: `Tech Tip featured image: ${a.title}`, href: `/admin/tech-tips/${a.id}` })),
    ...inline.map((a) => ({ kind: "inline" as const, label: `Tech Tip article image: ${a.title}`, href: `/admin/tech-tips/${a.id}` })),
  ];
}

export async function usageCounts(assetIds: string[]): Promise<Record<string, number>> {
  if (assetIds.length === 0) return {};
  const [slots, featured, articles] = await Promise.all([
    prisma.pageImage.groupBy({ by: ["assetId"], where: { assetId: { in: assetIds } }, _count: { _all: true } }),
    prisma.article.groupBy({ by: ["featuredImageId"], where: { featuredImageId: { in: assetIds } }, _count: { _all: true } }),
    prisma.article.findMany({ where: { content: { contains: "data-media-id=" } }, select: { content: true } }),
  ]);
  const out: Record<string, number> = Object.fromEntries(assetIds.map((id) => [id, 0]));
  for (const s of slots) out[s.assetId] += s._count._all;
  for (const f of featured) if (f.featuredImageId) out[f.featuredImageId] += f._count._all;
  for (const a of articles) for (const id of assetIds) if (a.content.includes(`data-media-id="${id}"`)) out[id] += 1;
  return out;
}

export async function deleteAsset(assetId: string, actorUserId?: string | null) {
  const usage = await getAssetUsage(assetId);
  if (usage.length > 0) throw new MediaValidationError(`This image is still used in ${usage.length} place${usage.length === 1 ? "" : "s"}. Remove it from those places first.`);
  const a = await prisma.mediaAsset.delete({ where: { id: assetId } });
  const store = getStorage();
  await store?.delete(a.masterKey).catch(() => undefined);
  await store?.deletePrefix(`variants/${a.id}/`).catch(() => undefined);
  await audit({ actorUserId, action: "media.deleted", entityType: "MediaAsset", entityId: assetId });
}

export async function listAssets(params: { q?: string; filter?: "all" | "used" | "unused" | "no-alt"; take?: number; skip?: number }) {
  const where: Prisma.MediaAssetWhereInput = {};
  const q = params.q?.trim();
  if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { altText: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, { originalFilename: { contains: q, mode: "insensitive" } }];
  if (params.filter === "no-alt") where.altText = "";
  const assets = await prisma.mediaAsset.findMany({ where, orderBy: { createdAt: "desc" }, take: params.filter === "used" || params.filter === "unused" ? 500 : (params.take ?? 60), skip: params.filter === "used" || params.filter === "unused" ? 0 : params.skip });
  const counts = await usageCounts(assets.map((a) => a.id));
  let rows = assets.map((a) => ({ ...a, usageCount: counts[a.id] ?? 0 }));
  if (params.filter === "used") rows = rows.filter((r) => r.usageCount > 0);
  if (params.filter === "unused") rows = rows.filter((r) => r.usageCount === 0);
  return rows;
}

// ---------------------------------------------------------------------------
// Page image slots
// ---------------------------------------------------------------------------

export async function assignSlot(params: {
  slotKey: string;
  assetId: string;
  altText?: string | null;
  crop?: Partial<Crop> | null;
  focal?: { x: number; y: number };
  mobileFocal?: { x: number; y: number };
  actorUserId?: string | null;
}) {
  const def = getSlotDef(params.slotKey);
  if (!def) throw new MediaValidationError("Unknown image slot.");
  const asset = await prisma.mediaAsset.findUnique({ where: { id: params.assetId } });
  if (!asset) throw new MediaValidationError("That image no longer exists.");
  const crop = normalizeCrop(params.crop ?? null);
  const clamp = (v: number | undefined) => (v == null || !Number.isFinite(v) ? 0.5 : Math.min(Math.max(v, 0), 1));
  const data = {
    assetId: asset.id,
    altText: params.altText?.trim() ? params.altText.trim().slice(0, 300) : null,
    ...cropColumns(crop),
    focalX: clamp(params.focal?.x),
    focalY: clamp(params.focal?.y),
    mobileFocalX: clamp(params.mobileFocal?.x),
    mobileFocalY: clamp(params.mobileFocal?.y),
    updatedById: params.actorUserId ?? null,
  };
  const slot = await prisma.pageImage.upsert({
    where: { slotKey: def.key },
    create: { slotKey: def.key, ...data },
    update: { ...data, version: { increment: 1 } },
  });
  await audit({ actorUserId: params.actorUserId, action: "page_image.published", entityType: "PageImage", entityId: def.key, metadata: { assetId: asset.id } });
  return slot;
}

export async function clearSlot(slotKey: string, actorUserId?: string | null) {
  await prisma.pageImage.deleteMany({ where: { slotKey } });
  await audit({ actorUserId, action: "page_image.removed", entityType: "PageImage", entityId: slotKey });
}

export type RenderableImage = {
  assetId: string;
  tag: string;
  width: number;
  height: number;
  alt: string;
  focal: { x: number; y: number };
  mobileFocal: { x: number; y: number };
};

export function slotRenderable(slot: PageImage & { asset: MediaAsset }): RenderableImage {
  const crop = cropOf(slot) ?? cropOf(slot.asset);
  const size = croppedSize(slot.asset.width, slot.asset.height, crop);
  return {
    assetId: slot.assetId,
    tag: slotTag(slot.slotKey, slot.version * 1000 + slot.asset.version),
    width: size.width,
    height: size.height,
    alt: slot.altText ?? slot.asset.altText,
    focal: { x: slot.focalX, y: slot.focalY },
    mobileFocal: { x: slot.mobileFocalX, y: slot.mobileFocalY },
  };
}

export function assetRenderable(asset: MediaAsset, altOverride?: string | null): RenderableImage {
  const size = croppedSize(asset.width, asset.height, cropOf(asset));
  return {
    assetId: asset.id,
    tag: assetTag(asset.version),
    width: size.width,
    height: size.height,
    alt: altOverride?.trim() || asset.altText,
    focal: { x: asset.focalX, y: asset.focalY },
    mobileFocal: { x: asset.focalX, y: asset.focalY },
  };
}

/** Loads the assigned images for the given slots (missing slots are omitted). */
export async function getPageImages(keys: string[]): Promise<Record<string, RenderableImage>> {
  try {
    const rows = await prisma.pageImage.findMany({ where: { slotKey: { in: keys } }, include: { asset: true } });
    return Object.fromEntries(rows.map((r) => [r.slotKey, slotRenderable(r)]));
  } catch (err) {
    // Never break a public page because of an image lookup.
    console.error("[media] could not load page images", (err as Error).message);
    return {};
  }
}

export async function listSlotsWithAssignments() {
  const rows = await prisma.pageImage.findMany({ include: { asset: true } });
  return PAGE_IMAGE_SLOTS.map((def) => {
    const row = rows.find((r) => r.slotKey === def.key);
    return { def, row: row ?? null, image: row ? slotRenderable(row) : null };
  });
}

// ---------------------------------------------------------------------------
// Variant generation (used by the /media route)
// ---------------------------------------------------------------------------

export type VariantResult = { body: Buffer; contentType: string; immutable: boolean } | null;

export async function getVariant(assetId: string, tag: string, width: number, format: VariantFormat): Promise<VariantResult> {
  if (!(VARIANT_WIDTHS as readonly number[]).includes(width)) return null;
  const parsed = parseTag(tag);
  if (!parsed) return null;
  const store = getStorage();
  if (!store) return null;
  const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
  if (!asset) return null;

  let crop: Crop | null;
  let current: boolean;
  if (parsed.kind === "asset") {
    crop = cropOf(asset);
    current = parsed.version === asset.version;
  } else if (parsed.kind === "original") {
    crop = null;
    current = parsed.version === asset.version;
  } else {
    const slot = await prisma.pageImage.findUnique({ where: { slotKey: parsed.slotKey } });
    if (!slot || slot.assetId !== asset.id) {
      // Slot changed since the page was rendered: serve the asset's default rendition briefly.
      crop = cropOf(asset);
      current = false;
    } else {
      crop = cropOf(slot) ?? cropOf(asset);
      current = parsed.version === slot.version * 1000 + asset.version;
    }
  }
  const contentType = format === "webp" ? "image/webp" : "image/jpeg";
  const cacheKey = `variants/${asset.id}/${tag}/${width}.${format}`;
  if (current) {
    const cached = await store.get(cacheKey);
    if (cached) return { body: cached, contentType, immutable: true };
  }
  const master = await store.get(asset.masterKey);
  if (!master) return null;
  const body = await renderVariant(master, crop, width, format);
  if (current) await store.put(cacheKey, body, contentType).catch(() => undefined);
  return { body, contentType, immutable: current };
}
