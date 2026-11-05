"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { failure, fd, success, type ActionState } from "@/lib/forms";
import { deleteAsset, MediaValidationError, setAssetCrop, updateAssetDetails } from "@/lib/media/service";
import type { CropFractions } from "@/components/admin/media/types";

function revalidatePublic() {
  for (const p of ["/", "/senior-living", "/services", "/about", "/tech-tips"]) revalidatePath(p);
}

export async function updateAssetDetailsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("website:manage");
  try {
    await updateAssetDetails({
      assetId: fd(formData, "id"),
      name: fd(formData, "name"),
      altText: fd(formData, "altText"),
      description: fd(formData, "description"),
      source: fd(formData, "source"),
      license: fd(formData, "license"),
      attribution: fd(formData, "attribution"),
      actorUserId: user.id,
    });
  } catch (err) {
    if (err instanceof MediaValidationError) return failure(err.message);
    throw err;
  }
  revalidatePath("/admin/media");
  revalidatePublic();
  return success("Image details saved.");
}

export async function saveAssetCropAction(assetId: string, crop: CropFractions | null, focal: { x: number; y: number }): Promise<ActionState> {
  const user = await requirePermission("website:manage");
  await setAssetCrop({ assetId, crop, focalX: focal.x, focalY: focal.y, actorUserId: user.id });
  revalidatePath(`/admin/media/${assetId}`);
  revalidatePublic();
  return success("Crop and focal point saved. Pages using this image now show the new version.");
}

export async function deleteAssetAction(formData: FormData) {
  const user = await requirePermission("website:manage");
  const id = fd(formData, "id");
  try {
    await deleteAsset(id, user.id);
  } catch (err) {
    if (err instanceof MediaValidationError) redirect(`/admin/media/${id}?error=${encodeURIComponent(err.message)}`);
    throw err;
  }
  revalidatePath("/admin/media");
  redirect("/admin/media?ok=Image%20deleted.");
}
