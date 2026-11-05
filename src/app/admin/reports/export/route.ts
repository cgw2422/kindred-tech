import { NextResponse, type NextRequest } from "next/server";
import { assertPermission, AuthorizationError } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { makeRange, REPORTS, toCsv, type ReportKey } from "@/lib/reports";
import { audit } from "@/lib/audit";
import { toDateKey } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await assertPermission("reports:view");
  } catch (err) {
    if (err instanceof AuthorizationError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw err;
  }
  const sp = req.nextUrl.searchParams;
  const key = (sp.get("report") ?? "revenue") as ReportKey;
  if (!(key in REPORTS)) return NextResponse.json({ error: "Unknown report" }, { status: 400 });
  const biz = await getSettings("business");
  const valid = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const today = toDateKey(new Date(), biz.timeZone);
  const from = valid(sp.get("from")) ?? `${today.slice(0, 4)}-01-01`;
  const to = valid(sp.get("to")) ?? today;
  const table = await REPORTS[key](makeRange(from, to, biz.timeZone));
  await audit({ actorUserId: user.id, action: "report.exported", entityType: "Report", entityId: key, metadata: { from, to } });
  return new NextResponse(toCsv(table), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kindred-${key}-${from}-to-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
