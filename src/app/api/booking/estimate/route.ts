import { NextResponse, type NextRequest } from "next/server";
import { publicEstimate } from "@/lib/booking/public";
import { ipFromHeaders, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ip = ipFromHeaders(req.headers);
  if (!(await rateLimit(`estimate:${ip}`, 120, 60))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const result = await publicEstimate({
    serviceId: sp.get("serviceId") ?? "",
    extensionBlocks: Math.min(Math.max(parseInt(sp.get("ext") ?? "0", 10) || 0, 0), 4),
    addonIds: (sp.get("addons") ?? "").split(",").filter(Boolean).slice(0, 10),
    postalCode: sp.get("zip") ?? undefined,
    discountCode: sp.get("code") ?? undefined,
  });
  if (!result) return NextResponse.json({ error: "Service not found" }, { status: 404 });
  return NextResponse.json(result);
}
