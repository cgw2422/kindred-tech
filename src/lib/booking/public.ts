import { z } from "zod";
import { prisma } from "../db";
import { getSettings } from "../settings";
import { estimatePrice } from "../pricing";
import { lookupServiceArea } from "./service";
import { getActiveMemberDiscount } from "./member";

/** Validation schema for the public booking submission. */
export const bookingSubmissionSchema = z
  .object({
    serviceId: z.string().min(1, "Please choose a service."),
    startsAt: z.string().datetime({ message: "Please choose an appointment time." }),
    extensionBlocks: z.number().int().min(0).max(4).default(0),
    addonIds: z.array(z.string()).max(10).default([]),
    discountCode: z.string().trim().max(40).optional().default(""),
    bookedForSelf: z.boolean(),
    customer: z.object({
      firstName: z.string().trim().min(1, "Please enter a first name.").max(60),
      lastName: z.string().trim().min(1, "Please enter a last name.").max(60),
      email: z
        .string()
        .trim()
        .toLowerCase()
        .max(200)
        .refine((v) => v === "" || z.string().email().safeParse(v).success, "Please enter a valid email address."),
      phone: z
        .string()
        .trim()
        .max(30)
        .refine((v) => v.replace(/\D/g, "").length >= 10, "Please enter a 10-digit phone number."),
      contactPreference: z.enum(["EMAIL", "PHONE", "TEXT", "MAIL"]).default("PHONE"),
    }),
    requester: z
      .object({
        name: z.string().trim().max(120).default(""),
        email: z.string().trim().toLowerCase().max(200).default(""),
        phone: z.string().trim().max(30).default(""),
        relationship: z.string().trim().max(60).default(""),
        canPay: z.boolean().default(false),
        receiveUpdates: z.boolean().default(true),
      })
      .optional(),
    address: z
      .object({
        line1: z.string().trim().max(200).default(""),
        line2: z.string().trim().max(200).default(""),
        city: z.string().trim().max(100).default(""),
        state: z.string().trim().max(2).default("OH"),
        postalCode: z.string().trim().max(10).default(""),
        accessNotes: z.string().trim().max(500).default(""),
      })
      .optional(),
    problemDescription: z.string().trim().max(4000).default(""),
    leadSource: z.string().trim().max(100).default(""),
    marketingOptIn: z.boolean().default(false),
    acceptedTerms: z.literal(true, { message: "Please confirm you have read the terms." }),
    website: z.string().max(0).optional().default(""), // honeypot
  })
  .superRefine((v, ctx) => {
    if (!v.bookedForSelf) {
      if (!v.requester?.name) ctx.addIssue({ code: "custom", path: ["requester", "name"], message: "Please enter your name." });
      const hasEmail = v.requester?.email && z.string().email().safeParse(v.requester.email).success;
      const hasPhone = (v.requester?.phone ?? "").replace(/\D/g, "").length >= 10;
      if (!hasEmail && !hasPhone) ctx.addIssue({ code: "custom", path: ["requester", "email"], message: "Please give us an email or phone number for you." });
    }
  });

export type BookingSubmission = z.infer<typeof bookingSubmissionSchema>;

export async function loadBookableServices() {
  return prisma.service.findMany({
    where: { isActive: true, isBookableOnline: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { addons: { where: { isActive: true } } },
  });
}

/** Server-side estimate for the review step (never trust a client-computed price). */
export async function publicEstimate(params: { serviceId: string; extensionBlocks: number; addonIds: string[]; postalCode?: string; discountCode?: string; customerEmail?: string }) {
  const service = await prisma.service.findUnique({ where: { id: params.serviceId }, include: { addons: true } });
  if (!service) return null;
  const [billing] = await Promise.all([getSettings("billing")]);
  const area = !service.isRemote && params.postalCode ? await lookupServiceArea(params.postalCode) : null;
  const inArea = service.isRemote || Boolean(area);
  let discount: { name: string; type: "PERCENT" | "FIXED"; value: number } | null = null;
  let discountError: string | null = null;
  if (params.discountCode) {
    const now = new Date();
    const d = await prisma.discount.findFirst({ where: { code: { equals: params.discountCode.trim(), mode: "insensitive" }, isActive: true } });
    if (d && (!d.startsAt || d.startsAt <= now) && (!d.endsAt || d.endsAt >= now) && (d.maxUses == null || d.usedCount < d.maxUses) && (!d.serviceId || d.serviceId === service.id)) {
      discount = { name: d.name, type: d.type, value: d.value };
    } else discountError = "That discount code is not valid.";
  }
  const memberDiscountPercent = params.customerEmail ? await getActiveMemberDiscount(params.customerEmail) : 0;
  const estimate = estimatePrice({
    service,
    addons: service.addons.filter((a) => a.isActive && params.addonIds.includes(a.id)),
    extensionBlocks: params.extensionBlocks,
    travelFeeCents: service.isRemote ? 0 : (area?.travelFeeCents ?? billing.defaultTravelFeeCents),
    discount,
    memberDiscountPercent,
    taxRatePercent: billing.taxRatePercent,
  });
  return { estimate, inArea, areaName: area?.name ?? null, discountError, durationMinutes: service.durationMinutes + params.extensionBlocks * (service.extensionMinutes ?? 0) };
}
