import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { addDaysToKey, startOfDayUtc } from "@/lib/time";
import {
  AdminError,
  assertCan,
  parseOrThrow,
  splitList,
  zBool,
  zDollars,
  zInt,
  zOptDateKey,
  zOptDollars,
  zOptId,
  zOptInt,
  zOptText,
  zSlug,
  zText,
  type Actor,
} from "./common";

const PERM = "services:manage" as const;

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export const serviceInputSchema = z
  .object({
    slug: zSlug,
    name: zText("Service name", 120),
    categoryId: zOptId,
    shortDescription: zText("Short description", 300),
    description: zOptText("Full description", 5000).transform((v) => v ?? ""),
    pricingType: z.enum(["FIXED", "STARTING_AT", "CUSTOM_QUOTE"], { error: "Please choose a pricing type." }),
    price: zDollars("Price"),
    durationMinutes: zInt("Duration (minutes)", 15, 720),
    extensionMinutes: zOptInt("Extension minutes", 5, 240),
    extensionPrice: zOptDollars("Extension price"),
    isRemote: zBool,
    isActive: zBool,
    isBookableOnline: zBool,
    requiresApproval: zBool,
    memberDiscountEligible: zBool,
    sortOrder: zOptInt("Sort order", -1000, 1000).transform((v) => v ?? 0),
  })
  .superRefine((v, ctx) => {
    if ((v.extensionMinutes == null) !== (v.extensionPrice == null)) {
      ctx.addIssue({ code: "custom", path: ["extensionPrice"], message: "Enter both extension minutes and extension price, or leave both blank." });
    }
    if (v.durationMinutes % 5 !== 0) ctx.addIssue({ code: "custom", path: ["durationMinutes"], message: "Duration must be in 5-minute steps." });
  });

export type ServiceInput = z.input<typeof serviceInputSchema>;

export async function saveService(actor: Actor, input: ServiceInput | Record<string, unknown>, id?: string | null) {
  assertCan(actor, PERM);
  const v = parseOrThrow(serviceInputSchema, input);
  if (v.categoryId && !(await prisma.serviceCategory.findUnique({ where: { id: v.categoryId } }))) {
    throw new AdminError("That category no longer exists.");
  }
  const clash = await prisma.service.findUnique({ where: { slug: v.slug } });
  if (clash && clash.id !== id) throw new AdminError("Another service already uses that slug.", { slug: "Another service already uses that slug." });
  const data = {
    slug: v.slug,
    name: v.name,
    categoryId: v.categoryId,
    shortDescription: v.shortDescription,
    description: v.description,
    pricingType: v.pricingType,
    basePriceCents: v.price,
    durationMinutes: v.durationMinutes,
    extensionMinutes: v.extensionMinutes,
    extensionPriceCents: v.extensionPrice,
    isRemote: v.isRemote,
    isActive: v.isActive,
    isBookableOnline: v.isBookableOnline,
    requiresApproval: v.requiresApproval,
    memberDiscountEligible: v.memberDiscountEligible,
    sortOrder: v.sortOrder,
  };
  const service = id ? await prisma.service.update({ where: { id }, data }) : await prisma.service.create({ data });
  await audit({
    actorUserId: actor.id,
    action: id ? "service.update" : "service.create",
    entityType: "Service",
    entityId: service.id,
    metadata: { slug: service.slug, priceCents: service.basePriceCents, pricingType: service.pricingType, isActive: service.isActive },
  });
  return service;
}

/** Deletes a service, or deactivates it when appointments/invoices/bundles reference it. */
export async function removeService(actor: Actor, id: string): Promise<"deleted" | "deactivated"> {
  assertCan(actor, PERM);
  const service = await prisma.service.findUnique({
    where: { id },
    include: { _count: { select: { appointments: true, invoiceLines: true, bundleItems: true } } },
  });
  if (!service) throw new AdminError("That service no longer exists.");
  const referenced = service._count.appointments + service._count.invoiceLines + service._count.bundleItems > 0;
  if (referenced) {
    await prisma.service.update({ where: { id }, data: { isActive: false, isBookableOnline: false } });
    await audit({ actorUserId: actor.id, action: "service.deactivate", entityType: "Service", entityId: id, metadata: { slug: service.slug } });
    return "deactivated";
  }
  await prisma.service.delete({ where: { id } });
  await audit({ actorUserId: actor.id, action: "service.delete", entityType: "Service", entityId: id, metadata: { slug: service.slug } });
  return "deleted";
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const categorySchema = z.object({
  name: zText("Category name", 80),
  slug: zSlug,
  sortOrder: zOptInt("Sort order", -1000, 1000).transform((v) => v ?? 0),
});

export async function saveCategory(actor: Actor, input: z.input<typeof categorySchema> | Record<string, unknown>, id?: string | null) {
  assertCan(actor, PERM);
  const v = parseOrThrow(categorySchema, input);
  const clash = await prisma.serviceCategory.findUnique({ where: { slug: v.slug } });
  if (clash && clash.id !== id) throw new AdminError("Another category already uses that slug.");
  const cat = id ? await prisma.serviceCategory.update({ where: { id }, data: v }) : await prisma.serviceCategory.create({ data: v });
  await audit({ actorUserId: actor.id, action: id ? "service_category.update" : "service_category.create", entityType: "ServiceCategory", entityId: cat.id, metadata: { slug: cat.slug } });
  return cat;
}

export async function deleteCategory(actor: Actor, id: string) {
  assertCan(actor, PERM);
  const cat = await prisma.serviceCategory.delete({ where: { id } });
  await audit({ actorUserId: actor.id, action: "service_category.delete", entityType: "ServiceCategory", entityId: id, metadata: { slug: cat.slug } });
}

// ---------------------------------------------------------------------------
// Add-ons
// ---------------------------------------------------------------------------

const addonSchema = z.object({
  name: zText("Add-on name", 120),
  description: zOptText("Description", 1000),
  serviceId: zOptId,
  price: zDollars("Price"),
  durationMinutes: zInt("Extra minutes", 0, 240),
  isActive: zBool,
});

export async function saveAddon(actor: Actor, input: z.input<typeof addonSchema> | Record<string, unknown>, id?: string | null) {
  assertCan(actor, PERM);
  const v = parseOrThrow(addonSchema, input);
  if (v.serviceId && !(await prisma.service.findUnique({ where: { id: v.serviceId } }))) throw new AdminError("That service no longer exists.");
  const data = { name: v.name, description: v.description, serviceId: v.serviceId, priceCents: v.price, durationMinutes: v.durationMinutes, isActive: v.isActive };
  const addon = id ? await prisma.serviceAddon.update({ where: { id }, data }) : await prisma.serviceAddon.create({ data });
  await audit({ actorUserId: actor.id, action: id ? "service_addon.update" : "service_addon.create", entityType: "ServiceAddon", entityId: addon.id, metadata: { name: addon.name, priceCents: addon.priceCents } });
  return addon;
}

export async function removeAddon(actor: Actor, id: string): Promise<"deleted" | "deactivated"> {
  assertCan(actor, PERM);
  const used = await prisma.appointment.count({ where: { addonIds: { has: id } } });
  if (used > 0) {
    await prisma.serviceAddon.update({ where: { id }, data: { isActive: false } });
    await audit({ actorUserId: actor.id, action: "service_addon.deactivate", entityType: "ServiceAddon", entityId: id });
    return "deactivated";
  }
  await prisma.serviceAddon.delete({ where: { id } });
  await audit({ actorUserId: actor.id, action: "service_addon.delete", entityType: "ServiceAddon", entityId: id });
  return "deleted";
}

// ---------------------------------------------------------------------------
// Bundles
// ---------------------------------------------------------------------------

const bundleSchema = z.object({
  name: zText("Bundle name", 120),
  description: zOptText("Description", 2000),
  price: zDollars("Bundle price"),
  isActive: zBool,
  items: z
    .array(z.object({ serviceId: z.string().min(1), quantity: zInt("Quantity", 1, 50) }))
    .min(1, "Choose at least one service for the bundle (set a quantity of 1 or more)."),
});

export async function saveBundle(actor: Actor, input: z.input<typeof bundleSchema> | Record<string, unknown>, id?: string | null) {
  assertCan(actor, PERM);
  const v = parseOrThrow(bundleSchema, input);
  const ids = [...new Set(v.items.map((i) => i.serviceId))];
  if ((await prisma.service.count({ where: { id: { in: ids } } })) !== ids.length) throw new AdminError("One of the selected services no longer exists.");
  const bundle = await prisma.$transaction(async (tx) => {
    const data = { name: v.name, description: v.description, priceCents: v.price, isActive: v.isActive };
    const b = id ? await tx.serviceBundle.update({ where: { id }, data }) : await tx.serviceBundle.create({ data });
    await tx.serviceBundleItem.deleteMany({ where: { bundleId: b.id } });
    await tx.serviceBundleItem.createMany({ data: v.items.map((i) => ({ bundleId: b.id, serviceId: i.serviceId, quantity: i.quantity })) });
    return b;
  });
  await audit({ actorUserId: actor.id, action: id ? "service_bundle.update" : "service_bundle.create", entityType: "ServiceBundle", entityId: bundle.id, metadata: { name: bundle.name, priceCents: bundle.priceCents, items: v.items.length } });
  return bundle;
}

export async function deleteBundle(actor: Actor, id: string) {
  assertCan(actor, PERM);
  await prisma.serviceBundle.delete({ where: { id } });
  await audit({ actorUserId: actor.id, action: "service_bundle.delete", entityType: "ServiceBundle", entityId: id });
}

// ---------------------------------------------------------------------------
// Discounts
// ---------------------------------------------------------------------------

export const discountInputSchema = z
  .object({
    name: zText("Discount name", 120),
    code: z
      .preprocess((v) => v ?? "", z.string())
      .transform((v) => v.trim().toUpperCase())
      .refine((v) => v === "" || /^[A-Z0-9_-]{3,30}$/.test(v), "Code must be 3 to 30 letters, numbers, dashes or underscores (no spaces).")
      .transform((v) => (v === "" ? null : v)),
    type: z.enum(["PERCENT", "FIXED"], { error: "Please choose percent or fixed amount." }),
    value: z.union([z.string(), z.number()], { error: "Discount amount is required." }),
    serviceId: zOptId,
    startDate: zOptDateKey("Start date"),
    endDate: zOptDateKey("End date"),
    maxUses: zOptInt("Maximum uses", 1, 1_000_000),
    isActive: zBool,
  })
  .transform((v, ctx) => {
    let value: number | null = null;
    const raw = String(v.value).trim().replace(/[%$,\s]/g, "");
    if (v.type === "PERCENT") {
      if (/^\d+$/.test(raw)) value = parseInt(raw, 10);
      if (value === null || value < 1 || value > 100) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Percent off must be a whole number from 1 to 100." });
        return z.NEVER;
      }
    } else {
      if (/^\d+(\.\d{1,2})?$/.test(raw)) value = Math.round(parseFloat(raw) * 100);
      if (value === null || value <= 0) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Amount off must be a dollar amount greater than $0." });
        return z.NEVER;
      }
    }
    if (v.startDate && v.endDate && v.endDate < v.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after the start date." });
      return z.NEVER;
    }
    return { ...v, value };
  });

export type DiscountInput = z.input<typeof discountInputSchema>;

export async function saveDiscount(actor: Actor, input: DiscountInput | Record<string, unknown>, id?: string | null) {
  assertCan(actor, PERM);
  const v = parseOrThrow(discountInputSchema, input);
  if (v.code) {
    const clash = await prisma.discount.findUnique({ where: { code: v.code } });
    if (clash && clash.id !== id) throw new AdminError("Another discount already uses that code.", { code: "Another discount already uses that code." });
  }
  if (v.serviceId && !(await prisma.service.findUnique({ where: { id: v.serviceId } }))) throw new AdminError("That service no longer exists.");
  const tz = (await getSettings("business")).timeZone;
  const data = {
    name: v.name,
    code: v.code,
    type: v.type,
    value: v.value,
    serviceId: v.serviceId,
    // Dates are inclusive business-local days.
    startsAt: v.startDate ? startOfDayUtc(v.startDate, tz) : null,
    endsAt: v.endDate ? startOfDayUtc(addDaysToKey(v.endDate, 1), tz) : null,
    maxUses: v.maxUses,
    isActive: v.isActive,
  };
  const discount = id ? await prisma.discount.update({ where: { id }, data }) : await prisma.discount.create({ data });
  await audit({
    actorUserId: actor.id,
    action: id ? "discount.update" : "discount.create",
    entityType: "Discount",
    entityId: discount.id,
    metadata: { code: discount.code, type: discount.type, value: discount.value, isActive: discount.isActive },
  });
  return discount;
}

export async function removeDiscount(actor: Actor, id: string): Promise<"deleted" | "deactivated"> {
  assertCan(actor, PERM);
  const d = await prisma.discount.findUnique({ where: { id }, include: { _count: { select: { appointments: true } } } });
  if (!d) throw new AdminError("That discount no longer exists.");
  if (d._count.appointments > 0 || d.usedCount > 0) {
    await prisma.discount.update({ where: { id }, data: { isActive: false } });
    await audit({ actorUserId: actor.id, action: "discount.deactivate", entityType: "Discount", entityId: id, metadata: { code: d.code } });
    return "deactivated";
  }
  await prisma.discount.delete({ where: { id } });
  await audit({ actorUserId: actor.id, action: "discount.delete", entityType: "Discount", entityId: id, metadata: { code: d.code } });
  return "deleted";
}

// ---------------------------------------------------------------------------
// Service areas
// ---------------------------------------------------------------------------

export const serviceAreaSchema = z
  .object({
    name: zText("Area name", 120),
    county: zText("County", 80),
    state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "State must be a 2-letter abbreviation (for example OH)."),
    postalCodes: z.union([z.string(), z.array(z.string())]).transform((v) => (Array.isArray(v) ? v.map((s) => s.trim()).filter(Boolean) : splitList(v))),
    communities: z.union([z.string(), z.array(z.string())]).transform((v) => (Array.isArray(v) ? v.map((s) => s.trim()).filter(Boolean) : splitList(v, /[,;\n]+/))),
    travelFee: zDollars("Travel fee"),
    isActive: zBool,
    notes: zOptText("Notes", 2000),
    sortOrder: zOptInt("Sort order", -1000, 1000).transform((v) => v ?? 0),
  })
  .superRefine((v, ctx) => {
    const bad = v.postalCodes.filter((p) => !/^\d{5}$/.test(p));
    if (bad.length) ctx.addIssue({ code: "custom", path: ["postalCodes"], message: `These ZIP codes are not 5 digits: ${bad.slice(0, 5).join(", ")}` });
    if (v.postalCodes.length === 0) ctx.addIssue({ code: "custom", path: ["postalCodes"], message: "Enter at least one 5-digit ZIP code." });
  });

export async function saveServiceArea(actor: Actor, input: z.input<typeof serviceAreaSchema> | Record<string, unknown>, id?: string | null) {
  assertCan(actor, PERM);
  const v = parseOrThrow(serviceAreaSchema, input);
  const { travelFee, ...rest } = v;
  const data = { ...rest, postalCodes: [...new Set(v.postalCodes)], communities: [...new Set(v.communities)], travelFeeCents: travelFee };
  const area = id ? await prisma.serviceArea.update({ where: { id }, data }) : await prisma.serviceArea.create({ data });
  await audit({ actorUserId: actor.id, action: id ? "service_area.update" : "service_area.create", entityType: "ServiceArea", entityId: area.id, metadata: { name: area.name, zipCount: area.postalCodes.length, isActive: area.isActive } });
  return area;
}

export async function deleteServiceArea(actor: Actor, id: string) {
  assertCan(actor, PERM);
  const a = await prisma.serviceArea.delete({ where: { id } });
  await audit({ actorUserId: actor.id, action: "service_area.delete", entityType: "ServiceArea", entityId: id, metadata: { name: a.name } });
}

