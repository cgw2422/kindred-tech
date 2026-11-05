"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { failure, success, type ActionState } from "@/lib/forms";
import { assignSlot, clearSlot, MediaValidationError } from "@/lib/media/service";
import { getSlotDef } from "@/lib/media/slots";
import type { CropFractions } from "@/components/admin/media/types";

export async function publishSlotAction(input: {
  slotKey: string;
  assetId: string;
  altText: string;
  crop: CropFractions | null;
  focal: { x: number; y: number };
  mobileFocal: { x: number; y: number };
}): Promise<ActionState> {
  const user = await requirePermission("website:manage");
  const def = getSlotDef(input.slotKey);
  if (!def) return failure("Unknown image slot.");
  try {
    await assignSlot({ ...input, actorUserId: user.id });
  } catch (err) {
    if (err instanceof MediaValidationError) return failure(err.message);
    throw err;
  }
  // Pages render on each request; this also clears any cached render of the page.
  revalidatePath(def.pagePath);
  revalidatePath("/admin/page-images");
  return success(`Published. The ${def.page} page now shows this photograph.`);
}

export async function removeSlotAction(slotKey: string): Promise<ActionState> {
  const user = await requirePermission("website:manage");
  const def = getSlotDef(slotKey);
  if (!def) return failure("Unknown image slot.");
  await clearSlot(slotKey, user.id);
  revalidatePath(def.pagePath);
  revalidatePath("/admin/page-images");
  return success(`Removed. The ${def.page} page is back to its text-only layout.`);
}
