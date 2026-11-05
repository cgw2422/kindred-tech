import "server-only";
import { cache } from "react";
import { requirePermission } from "@/lib/auth/session";
import { businessTimeZone, getTechnicianForUser } from "@/lib/tech/access";

/**
 * Resolves the signed-in user and their Technician row. Redirects to login
 * or /forbidden when not permitted. Returns technician = null when the user
 * (e.g. an owner) has no technician profile.
 */
export const getTechContext = cache(async () => {
  const user = await requirePermission("tech:portal", "/tech");
  const [technician, tz] = await Promise.all([getTechnicianForUser(user.id), businessTimeZone()]);
  return { user, technician: technician && technician.isActive ? technician : null, tz };
});
