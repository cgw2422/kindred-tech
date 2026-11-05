/**
 * Public URLs for media variants (safe to import in client components).
 *   /media/<assetId>/a<assetVersion>/<width>.<webp|jpg>               asset default crop
 *   /media/<assetId>/p<slotVersion>-<slotKey>/<width>.<webp|jpg>      page-slot crop
 * Versions are part of the path, so every change produces new URLs and the
 * long-lived browser cache never shows an outdated image.
 */
export const RESPONSIVE_WIDTHS = [320, 480, 640, 800, 960, 1200, 1600, 2000];

export function assetTag(version: number) {
  return `a${version}`;
}

/** Full image without any crop (used by the admin crop editors). */
export function originalTag(version: number) {
  return `o${version}`;
}

export function slotTag(slotKey: string, slotVersion: number) {
  return `p${slotVersion}-${slotKey}`;
}

export function variantUrl(assetId: string, tag: string, width: number, format: "webp" | "jpg") {
  return `/media/${assetId}/${tag}/${width}.${format}`;
}

/** srcset for widths up to the source width (never upscale). */
export function srcSet(assetId: string, tag: string, sourceWidth: number, format: "webp" | "jpg") {
  const widths = RESPONSIVE_WIDTHS.filter((w) => w <= sourceWidth);
  if (widths.length === 0 || widths[widths.length - 1] < sourceWidth) widths.push(RESPONSIVE_WIDTHS.find((w) => w >= sourceWidth) ?? RESPONSIVE_WIDTHS[RESPONSIVE_WIDTHS.length - 1]);
  return [...new Set(widths)].map((w) => `${variantUrl(assetId, tag, w, format)} ${Math.min(w, sourceWidth)}w`).join(", ");
}

export function fallbackWidth(sourceWidth: number) {
  return RESPONSIVE_WIDTHS.filter((w) => w <= Math.max(sourceWidth, 320)).find((w) => w >= 960) ?? RESPONSIVE_WIDTHS.filter((w) => w <= Math.max(sourceWidth, 320)).pop() ?? 320;
}

export function parseTag(tag: string): { kind: "asset"; version: number } | { kind: "original"; version: number } | { kind: "slot"; version: number; slotKey: string } | null {
  let m = /^a(\d{1,9})$/.exec(tag);
  if (m) return { kind: "asset", version: Number(m[1]) };
  m = /^o(\d{1,9})$/.exec(tag);
  if (m) return { kind: "original", version: Number(m[1]) };
  m = /^p(\d{1,9})-([a-z0-9-]{1,60})$/.exec(tag);
  if (m) return { kind: "slot", version: Number(m[1]), slotKey: m[2] };
  return null;
}
