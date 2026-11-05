/** Signature data-URL validation (pure; shared by server and tests). */

export const SIGNATURE_PREFIX = "data:image/png;base64,";
/** Maximum decoded PNG size. */
export const MAX_SIGNATURE_BYTES = 200 * 1024;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function signatureProblem(dataUrl: string): string | null {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(SIGNATURE_PREFIX)) return "The signature must be a PNG image.";
  const b64 = dataUrl.slice(SIGNATURE_PREFIX.length);
  if (b64.length === 0) return "The signature is empty.";
  // Base64 inflates by 4/3; check the string length before decoding.
  if (b64.length > Math.ceil((MAX_SIGNATURE_BYTES * 4) / 3) + 4) return "The signature image is too large.";
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return "The signature image is not valid.";
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length > MAX_SIGNATURE_BYTES) return "The signature image is too large.";
  if (bytes.length < PNG_MAGIC.length || PNG_MAGIC.some((b, i) => bytes[i] !== b)) return "The signature image is not valid.";
  return null;
}
