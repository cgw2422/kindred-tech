"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { fd, formObject, type ActionState } from "@/lib/forms";
import { toActionState, type Actor } from "@/lib/admin/common";
import {
  deleteBundle,
  deleteCategory,
  deleteServiceArea,
  removeAddon,
  removeDiscount,
  removeService,
  saveAddon,
  saveBundle,
  saveCategory,
  saveDiscount,
  saveService,
  saveServiceArea,
} from "@/lib/admin/services";

async function actor(): Promise<Actor> {
  const u = await requirePermission("services:manage", "/admin/services");
  return { id: u.id, role: u.role };
}

function done(res: ActionState, ...paths: string[]) {
  if (res.ok) for (const p of ["/admin/services", ...paths]) revalidatePath(p);
  return res;
}

export async function saveServiceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  const id = fd(formData, "id") || null;
  let createdId: string | null = null;
  const res = await toActionState(async () => {
    const s = await saveService(a, formObject(formData), id);
    if (!id) createdId = s.id;
    return `Saved "${s.name}".`;
  });
  done(res, id ? `/admin/services/${id}` : "/admin/services");
  if (res.ok && createdId) redirect(`/admin/services/${createdId}?created=1`);
  return res;
}

export async function removeServiceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  const id = fd(formData, "id");
  let outcome: "deleted" | "deactivated" | null = null;
  const res = await toActionState(async () => {
    outcome = await removeService(a, id);
    return outcome === "deleted" ? "Service deleted." : "This service has appointment or invoice history, so it was deactivated instead of deleted.";
  });
  done(res);
  if (res.ok && outcome === "deleted") redirect("/admin/services?deleted=1");
  if (res.ok) revalidatePath(`/admin/services/${id}`);
  return res;
}

export async function saveCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  const id = fd(formData, "id") || null;
  return done(await toActionState(async () => `Saved category "${(await saveCategory(a, formObject(formData), id)).name}".`), "/admin/services/categories");
}

export async function deleteCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  return done(
    await toActionState(async () => {
      await deleteCategory(a, fd(formData, "id"));
      return "Category deleted. Its services are now uncategorized.";
    }),
    "/admin/services/categories",
  );
}

export async function saveAddonAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  const id = fd(formData, "id") || null;
  return done(await toActionState(async () => `Saved add-on "${(await saveAddon(a, formObject(formData), id)).name}".`), "/admin/services/addons");
}

export async function removeAddonAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  return done(
    await toActionState(async () => ((await removeAddon(a, fd(formData, "id"))) === "deleted" ? "Add-on deleted." : "Add-on was used on appointments, so it was deactivated.")),
    "/admin/services/addons",
  );
}

export async function saveBundleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  const id = fd(formData, "id") || null;
  const items: { serviceId: string; quantity: string }[] = [];
  for (const [k, v] of formData.entries()) {
    const m = /^qty_(.+)$/.exec(k);
    if (m && typeof v === "string" && v.trim() !== "" && v.trim() !== "0") items.push({ serviceId: m[1], quantity: v.trim() });
  }
  const form = formObject(formData);
  return done(
    await toActionState(async () => `Saved bundle "${(await saveBundle(a, { name: form.name, description: form.description, price: form.price, isActive: form.isActive, items }, id)).name}".`),
    "/admin/services/bundles",
  );
}

export async function deleteBundleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  return done(
    await toActionState(async () => {
      await deleteBundle(a, fd(formData, "id"));
      return "Bundle deleted.";
    }),
    "/admin/services/bundles",
  );
}

export async function saveDiscountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  const id = fd(formData, "id") || null;
  return done(await toActionState(async () => `Saved discount "${(await saveDiscount(a, formObject(formData), id)).name}".`), "/admin/services/discounts");
}

export async function removeDiscountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  return done(
    await toActionState(async () => ((await removeDiscount(a, fd(formData, "id"))) === "deleted" ? "Discount deleted." : "Discount has been used, so it was deactivated.")),
    "/admin/services/discounts",
  );
}

export async function saveServiceAreaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  const id = fd(formData, "id") || null;
  return done(await toActionState(async () => `Saved service area "${(await saveServiceArea(a, formObject(formData), id)).name}".`), "/admin/services/areas");
}

export async function deleteServiceAreaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  return done(
    await toActionState(async () => {
      await deleteServiceArea(a, fd(formData, "id"));
      return "Service area deleted.";
    }),
    "/admin/services/areas",
  );
}
