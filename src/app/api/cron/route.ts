import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { runDueJobs, schedulePeriodicJobs } from "@/lib/jobs/handlers";

export const dynamic = "force-dynamic";

/**
 * Alternative to the worker process: an external scheduler (e.g. Railway cron)
 * can POST here with `Authorization: Bearer $CRON_SECRET`.
 */
export async function POST(req: NextRequest) {
  const secret = env.cronSecret;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  const provided = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await schedulePeriodicJobs();
  const result = await runDueJobs({ workerId: "cron", limit: 50 });
  return NextResponse.json({ ok: true, ...result });
}
