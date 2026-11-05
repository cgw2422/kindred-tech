"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { flashRedirect } from "@/lib/admin-helpers";
import { fd } from "@/lib/forms";
import { assignTechnician, BookingError } from "@/lib/booking/service";
import { clearManualOrder, geocodeMissing, loadDispatchDay, planTechnicianRoute, saveManualOrder } from "@/lib/routing/dispatch";

function back(date: string) {
  return `/admin/dispatch?date=${date}`;
}

export async function geocodeDayAction(formData: FormData) {
  const user = await requirePermission("dispatch:manage");
  const date = fd(formData, "date");
  const day = await loadDispatchDay(date);
  const ids = day.appointments.map((a) => a.addressId).filter((x): x is string => Boolean(x));
  const r = await geocodeMissing(ids);
  await audit({ actorUserId: user.id, action: "dispatch.geocode", entityType: "RoutePlan", metadata: { date, geocoded: r.geocoded, failed: r.failed } });
  if (!r.provider) flashRedirect(back(date), "error", "No maps provider is configured. Add GOOGLE_MAPS_API_KEY or MAPBOX_ACCESS_TOKEN to enable geocoding.");
  flashRedirect(back(date), r.failed ? "error" : "ok", `Located ${r.geocoded} address(es)${r.failed ? `; ${r.failed} could not be located` : ""}.`);
}

export async function calculateRoutesAction(formData: FormData) {
  const user = await requirePermission("dispatch:manage");
  const date = fd(formData, "date");
  const day = await loadDispatchDay(date);
  let errors = 0;
  for (const t of day.technicians) {
    try {
      await planTechnicianRoute({ technicianId: t.id, dateKey: date, appointments: day.appointments, useProvider: true, save: true });
    } catch (err) {
      errors++;
      console.error("[dispatch] route calc failed", (err as Error).message);
    }
  }
  await audit({ actorUserId: user.id, action: "dispatch.routes_calculated", entityType: "RoutePlan", metadata: { date, errors } });
  revalidatePath("/admin/dispatch");
  flashRedirect(back(date), errors ? "error" : "ok", errors ? `Routes recalculated with ${errors} provider error(s). Manual mode used where needed.` : "Routes recalculated. Appointment times were not changed.");
}

export async function moveStopAction(formData: FormData) {
  const user = await requirePermission("dispatch:manage");
  const date = fd(formData, "date");
  const technicianId = fd(formData, "technicianId");
  const order = fd(formData, "order").split(",").filter(Boolean);
  const id = fd(formData, "id");
  const dir = fd(formData, "dir");
  const i = order.indexOf(id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= order.length) flashRedirect(back(date), "error", "Cannot move that stop.");
  [order[i], order[j]] = [order[j], order[i]];
  const valid = await prisma.appointment.count({ where: { id: { in: order }, technicianId } });
  if (valid !== order.length) flashRedirect(back(date), "error", "Route changed; please refresh.");
  await saveManualOrder(technicianId, date, order);
  await audit({ actorUserId: user.id, action: "dispatch.route_override", entityType: "RoutePlan", metadata: { date, technicianId } });
  revalidatePath("/admin/dispatch");
  flashRedirect(back(date), "ok", "Visit order updated (manual override). Appointment times were not changed.");
}

export async function resetOrderAction(formData: FormData) {
  await requirePermission("dispatch:manage");
  const date = fd(formData, "date");
  await clearManualOrder(fd(formData, "technicianId"), date);
  flashRedirect(back(date), "ok", "Manual override cleared.");
}

export async function dispatchAssignAction(formData: FormData) {
  const user = await requirePermission("dispatch:manage");
  const date = fd(formData, "date");
  try {
    await assignTechnician({ appointmentId: fd(formData, "id"), technicianId: fd(formData, "technicianId") || null, actorUserId: user.id });
  } catch (err) {
    if (err instanceof BookingError) flashRedirect(back(date), "error", err.message);
    throw err;
  }
  await audit({ actorUserId: user.id, action: "appointment.assigned", entityType: "Appointment", entityId: fd(formData, "id") });
  revalidatePath("/admin/dispatch");
  flashRedirect(back(date), "ok", "Assignment saved. Recalculate routes to update drive times.");
}
