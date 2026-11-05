import { NextResponse, type NextRequest } from "next/server";
import { getAvailability, BookingError, findAppointmentByManageToken } from "@/lib/booking/service";
import { getSettings } from "@/lib/settings";
import { ipFromHeaders, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Public: available appointment start times. Does not reveal technician identities or other bookings. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ip = ipFromHeaders(req.headers);
  if (!(await rateLimit(`availability:${ip}`, 120, 60))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const serviceId = sp.get("serviceId") ?? "";
  const from = sp.get("from") ?? undefined;
  const days = Math.min(Math.max(parseInt(sp.get("days") ?? "14", 10) || 14, 1), 31);
  const ext = Math.min(Math.max(parseInt(sp.get("ext") ?? "0", 10) || 0, 0), 4);
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) return NextResponse.json({ error: "Invalid date" }, { status: 400 });

  // When rescheduling through a manage link, exclude the appointment's own slot.
  let excludeAppointmentId: string | undefined;
  const manageToken = sp.get("manage");
  if (manageToken) {
    const appt = await findAppointmentByManageToken(manageToken);
    if (appt) excludeAppointmentId = appt.id;
  }
  try {
    const days_ = await getAvailability({ serviceId, fromDateKey: from, days, extensionBlocks: ext, excludeAppointmentId });
    const biz = await getSettings("business");
    return NextResponse.json({
      timeZone: biz.timeZone,
      days: days_.map((d) => ({ date: d.dateKey, slots: d.slots.map((s) => s.startsAt.toISOString()) })),
    });
  } catch (err) {
    if (err instanceof BookingError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
