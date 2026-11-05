import "server-only";
import { redirect } from "next/navigation";
import { requirePermission } from "../auth/session";
import { getPortalContext } from "./portal";

/** For facility portal pages/actions: signed-in FACILITY_CONTACT with portal access to a facility. */
export async function requirePortalUser(nextPath = "/facility") {
  const user = await requirePermission("facility:portal", nextPath);
  const ctx = await getPortalContext(user.id);
  if (!ctx) redirect("/forbidden");
  return { user, ctx };
}
