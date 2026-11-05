import crypto from "node:crypto";
import sharp from "sharp";

/**
 * Image processing for the media library (sharp).
 * - Only JPEG, PNG and WebP are accepted, verified from the file contents (not the name).
 * - Orientation is applied, then ALL metadata (EXIF incl. GPS, XMP, IPTC) is removed:
 *   sharp writes no metadata unless asked to.
 * - Masters are capped at MASTER_MAX_EDGE px; responsive variants are made on demand.
 */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_INPUT_PIXELS = 60_000_000;
export const MASTER_MAX_EDGE = 3200;
export const VARIANT_WIDTHS = [320, 480, 640, 800, 960, 1200, 1600, 2000] as const;
export type VariantFormat = "webp" | "jpg";

export class MediaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaValidationError";
  }
}

const ACCEPTED: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export type IngestResult = { buffer: Buffer; mimeType: string; ext: string; width: number; height: number; sha256: string };

export async function ingestImage(input: Buffer): Promise<IngestResult> {
  if (input.length === 0) throw new MediaValidationError("The file is empty.");
  if (input.length > MAX_UPLOAD_BYTES) throw new MediaValidationError(`Images must be ${MAX_UPLOAD_BYTES / 1024 / 1024} MB or smaller.`);
  let meta: sharp.Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new MediaValidationError("That file is not a readable JPG, PNG, or WebP image.");
  }
  const mimeType = meta.format ? ACCEPTED[meta.format] : undefined;
  if (!mimeType) throw new MediaValidationError("Only JPG, PNG, and WebP images can be uploaded.");
  if ((meta.pages ?? 1) > 1) throw new MediaValidationError("Animated images are not supported.");
  if (!meta.width || !meta.height || meta.width < 200 || meta.height < 200) throw new MediaValidationError("Images must be at least 200 pixels wide and tall.");

  let pipeline = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate() // apply EXIF orientation before metadata is discarded
    .resize({ width: MASTER_MAX_EDGE, height: MASTER_MAX_EDGE, fit: "inside", withoutEnlargement: true });
  let ext: string;
  if (meta.format === "png" && meta.hasAlpha) {
    pipeline = pipeline.png({ compressionLevel: 9 });
    ext = "png";
  } else if (meta.format === "webp") {
    pipeline = pipeline.webp({ quality: 90 });
    ext = "webp";
  } else {
    pipeline = pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: 88, mozjpeg: true });
    ext = "jpg";
  }
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return {
    buffer: data,
    mimeType: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg",
    ext,
    width: info.width,
    height: info.height,
    sha256: crypto.createHash("sha256").update(data).digest("hex"),
  };
}

export type Crop = { x: number; y: number; w: number; h: number };

/** Validates a crop expressed as fractions of the image. Returns null for "no crop". */
export function normalizeCrop(c: Partial<Crop> | null | undefined): Crop | null {
  if (!c || c.x == null || c.y == null || c.w == null || c.h == null) return null;
  const vals = [c.x, c.y, c.w, c.h];
  if (vals.some((v) => !Number.isFinite(v))) return null;
  const x = Math.min(Math.max(c.x, 0), 1);
  const y = Math.min(Math.max(c.y, 0), 1);
  const w = Math.min(Math.max(c.w, 0.02), 1 - x);
  const h = Math.min(Math.max(c.h, 0.02), 1 - y);
  if (x === 0 && y === 0 && w >= 0.999 && h >= 0.999) return null;
  return { x, y, w, h };
}

export function croppedSize(width: number, height: number, crop: Crop | null) {
  if (!crop) return { width, height };
  return { width: Math.max(1, Math.round(width * crop.w)), height: Math.max(1, Math.round(height * crop.h)) };
}

export async function renderVariant(master: Buffer, crop: Crop | null, width: number, format: VariantFormat): Promise<Buffer> {
  let img = sharp(master, { limitInputPixels: MAX_INPUT_PIXELS });
  if (crop) {
    const meta = await img.metadata();
    const W = meta.width!;
    const H = meta.height!;
    const left = Math.min(W - 1, Math.round(crop.x * W));
    const top = Math.min(H - 1, Math.round(crop.y * H));
    img = img.extract({ left, top, width: Math.max(1, Math.min(W - left, Math.round(crop.w * W))), height: Math.max(1, Math.min(H - top, Math.round(crop.h * H))) });
  }
  img = img.resize({ width, withoutEnlargement: true });
  return format === "webp" ? img.webp({ quality: 80 }).toBuffer() : img.flatten({ background: "#ffffff" }).jpeg({ quality: 82, mozjpeg: true, progressive: true }).toBuffer();
}
