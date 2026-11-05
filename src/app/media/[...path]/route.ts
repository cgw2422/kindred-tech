import { NextResponse } from "next/server";
import { getVariant } from "@/lib/media/service";

export const dynamic = "force-dynamic";

/**
 * Public image variants: /media/<assetId>/<tag>/<width>.<webp|jpg>
 * Generated on first request from the stored master, cached in object storage,
 * and served with long-lived immutable caching (URLs change whenever an image changes).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (path.length !== 3) return new NextResponse("Not found", { status: 404 });
  const [assetId, tag, file] = path;
  const m = /^(\d{2,4})\.(webp|jpg)$/.exec(file);
  if (!/^[a-z0-9]{10,40}$/i.test(assetId) || !m) return new NextResponse("Not found", { status: 404 });
  try {
    const v = await getVariant(assetId, tag, Number(m[1]), m[2] as "webp" | "jpg");
    if (!v) return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    return new NextResponse(new Uint8Array(v.body), {
      headers: {
        "Content-Type": v.contentType,
        "Content-Length": String(v.body.length),
        "Cache-Control": v.immutable ? "public, max-age=31536000, immutable" : "public, max-age=60",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch (err) {
    console.error("[media] variant failed", (err as Error).message);
    return new NextResponse("Image unavailable", { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
