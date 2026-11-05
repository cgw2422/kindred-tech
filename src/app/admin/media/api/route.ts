import { NextResponse, type NextRequest } from "next/server";
import { assertPermission, AuthorizationError } from "@/lib/auth/session";
import { listAssets } from "@/lib/media/service";
import { assetTag, variantUrl } from "@/lib/media/urls";

export const dynamic = "force-dynamic";

/** Admin-only JSON list of media assets for the image picker. */
export async function GET(req: NextRequest) {
  try {
    await assertPermission("website:manage");
  } catch (err) {
    if (err instanceof AuthorizationError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw err;
  }
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const rows = await listAssets({ q, take: 60 });
  return NextResponse.json(
    {
      assets: rows.map((a) => ({
        id: a.id,
        name: a.name,
        altText: a.altText,
        width: a.width,
        height: a.height,
        version: a.version,
        usageCount: a.usageCount,
        thumb: variantUrl(a.id, assetTag(a.version), 480, "webp"),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
