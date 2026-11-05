"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { MembershipUsageType } from "@prisma/client";
import { requirePermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { failure, fd, fdBool, fdOptional, success, zodFieldErrors, type ActionState } from "@/lib/forms";
import { parseDollarsToCents } from "@/lib/money";
import {
  activateMembership,
  cancelMembership,
  createMembership,
  keepMembership,
  pauseMembership,
  recordUsage,
  renewOfflineMembership,
  resumeMembership,
} from "@/lib/memberships/service";
import { createMembershipCheckoutSession } from "@/lib/payments/stripe";

function knownError(err: unknown): string | null {
  const e = err as Error;
  return ["MembershipError", "PaymentError", "PaymentsNotConfiguredError", "InvoiceError"].includes(e?.name) ? e.message : null;
}

async function run(fn: () => Promise<string>, revalidate: string[]): Promise<ActionState> {
  try {
    const msg = await fn();
    for (const p of revalidate) revalidatePath(p);
    return success(msg);
  } catch (err) {
    const msg = knownError(err);
    if (msg) return failure(msg);
    console.error("[memberships]", (err as Error).message);
    return failure("Something went wrong. Please try again.");
  }
}

export async function createMembershipAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("memberships:manage");
  const priceRaw = fd(formData, "price");
  const priceCents = priceRaw ? parseDollarsToCents(priceRaw) : undefined;
  if (priceCents === null || (priceCents !== undefined && priceCents < 0)) return failure("Enter a valid price.", { price: "Enter a dollar amount" });
  let id: string;
  try {
    const m = await createMembership({
      customerId: fd(formData, "customerId"),
      planId: fd(formData, "planId"),
      purchaserContactId: fdOptional(formData, "purchaserContactId"),
      priceCents,
      actorUserId: user.id,
    });
    id = m.id;
    await audit({ actorUserId: user.id, action: "membership.create", entityType: "Membership", entityId: m.id, metadata: { planId: m.planId, priceCents: m.priceCents } });
  } catch (err) {
    const msg = knownError(err);
    if (msg) return failure(msg);
    throw err;
  }
  redirect(`/admin/memberships/${id}`);
}

export async function membershipCheckoutLinkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("memberships:manage");
  const id = fd(formData, "membershipId");
  try {
    const s = await createMembershipCheckoutSession(id, { returnTo: undefined });
    await audit({ actorUserId: user.id, action: "membership.checkout_link", entityType: "Membership", entityId: id });
    return success("Stripe checkout link created. Send it to the customer or open it now. The membership activates when Stripe confirms payment.", { checkoutUrl: s.url });
  } catch (err) {
    const msg = knownError(err);
    if (msg) return failure(msg);
    console.error("[memberships] checkout", (err as Error).message);
    return failure("Could not create a Stripe checkout link.");
  }
}

export async function activateMembershipAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("memberships:manage");
  const id = fd(formData, "membershipId");
  return run(async () => {
    await activateMembership(id, { actorUserId: user.id, note: fdOptional(formData, "note"), sendWelcome: fdBool(formData, "sendWelcome") });
    await audit({ actorUserId: user.id, action: "membership.activate_manual", entityType: "Membership", entityId: id });
    return "Membership activated. Record the payment on an invoice if one was collected.";
  }, [`/admin/memberships/${id}`, "/admin/memberships"]);
}

export async function cancelMembershipAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("memberships:manage");
  const id = fd(formData, "membershipId");
  const immediately = fd(formData, "when") === "now";
  return run(async () => {
    await cancelMembership(id, { immediately, reason: fdOptional(formData, "reason"), actorUserId: user.id });
    await audit({ actorUserId: user.id, action: immediately ? "membership.cancel_now" : "membership.cancel_at_period_end", entityType: "Membership", entityId: id });
    return immediately ? "Membership canceled." : "Membership will cancel at the end of the current period.";
  }, [`/admin/memberships/${id}`, "/admin/memberships"]);
}

export async function membershipStateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("memberships:manage");
  const id = fd(formData, "membershipId");
  const op = fd(formData, "op");
  return run(async () => {
    if (op === "pause") await pauseMembership(id, { reason: fdOptional(formData, "reason"), actorUserId: user.id });
    else if (op === "resume") await resumeMembership(id, { actorUserId: user.id });
    else if (op === "keep") await keepMembership(id, { actorUserId: user.id });
    else if (op === "renew") await renewOfflineMembership(id, { actorUserId: user.id, note: fdOptional(formData, "note") });
    else return "Nothing to do.";
    await audit({ actorUserId: user.id, action: `membership.${op}`, entityType: "Membership", entityId: id });
    return { pause: "Membership paused.", resume: "Membership resumed.", keep: "Scheduled cancellation removed.", renew: "Membership renewed for another period." }[op]!;
  }, [`/admin/memberships/${id}`, "/admin/memberships"]);
}

const USAGE_TYPES: MembershipUsageType[] = ["REMOTE_MINUTES", "ANNUAL_REVIEW", "IN_HOME_DISCOUNT", "PRIORITY_BOOKING"];

export async function recordUsageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("memberships:manage");
  const id = fd(formData, "membershipId");
  const type = fd(formData, "type") as MembershipUsageType;
  if (!USAGE_TYPES.includes(type)) return failure("Choose a benefit.");
  const minutes = parseInt(fd(formData, "minutes"), 10);
  const visitPrice = fd(formData, "visitPrice") ? parseDollarsToCents(fd(formData, "visitPrice")) : undefined;
  if (type === "REMOTE_MINUTES" && !(minutes > 0)) return failure("Enter the number of remote minutes used.", { minutes: "Required" });
  if (type === "IN_HOME_DISCOUNT" && !visitPrice) return failure("Enter the visit price before the discount.", { visitPrice: "Required" });
  return run(async () => {
    const u = await recordUsage({ membershipId: id, type, quantity: type === "REMOTE_MINUTES" ? minutes : 1, visitPriceCents: visitPrice ?? undefined, notes: fdOptional(formData, "notes") });
    await audit({ actorUserId: user.id, action: "membership.usage", entityType: "Membership", entityId: id, metadata: { type, quantity: u.quantity, valueCents: u.valueCents } });
    return "Usage recorded.";
  }, [`/admin/memberships/${id}`]);
}

const planSchema = z.object({
  name: z.string().trim().min(2, "Enter a plan name.").max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,60}$/, "Use lowercase letters, numbers, and dashes."),
  description: z.string().trim().max(1000),
  interval: z.enum(["MONTH", "YEAR"]),
  stripePriceId: z
    .string()
    .trim()
    .max(100)
    .refine((v) => v === "" || /^price_[A-Za-z0-9]+$/.test(v), "Stripe price ids start with price_"),
  remoteMinutesPerPeriod: z.coerce.number().int().min(0).max(10_000),
  inHomeDiscountPercent: z.coerce.number().int().min(0, "0–50%").max(50, "Discounts above 50% are not allowed; plans never include free or unlimited visits."),
});

export async function savePlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("memberships:manage");
  const planId = fdOptional(formData, "planId");
  const parsed = planSchema.safeParse({
    name: fd(formData, "name"),
    slug: fd(formData, "slug"),
    description: fd(formData, "description"),
    interval: fd(formData, "interval"),
    stripePriceId: fd(formData, "stripePriceId"),
    remoteMinutesPerPeriod: fd(formData, "remoteMinutesPerPeriod") || "0",
    inHomeDiscountPercent: fd(formData, "inHomeDiscountPercent") || "0",
  });
  if (!parsed.success) return failure("Please check the highlighted fields.", zodFieldErrors(parsed.error));
  const priceCents = parseDollarsToCents(fd(formData, "price"));
  if (priceCents == null || priceCents < 0) return failure("Enter a valid price.", { price: "Enter a dollar amount" });
  const benefitsText = fd(formData, "benefitsText")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
  if (benefitsText.some((b) => /unlimited\s+(in[- ]home|visits?)/i.test(b))) return failure("Plans must not promise unlimited in-home visits.", { benefitsText: "Remove 'unlimited' visit wording" });
  const data = {
    ...parsed.data,
    stripePriceId: parsed.data.stripePriceId || null,
    priceCents,
    priorityScheduling: fdBool(formData, "priorityScheduling"),
    annualReviewIncluded: fdBool(formData, "annualReviewIncluded"),
    isActive: fdBool(formData, "isActive"),
    benefitsText,
  };
  try {
    const plan = planId ? await prisma.membershipPlan.update({ where: { id: planId }, data }) : await prisma.membershipPlan.create({ data });
    await audit({ actorUserId: user.id, action: planId ? "membership_plan.update" : "membership_plan.create", entityType: "MembershipPlan", entityId: plan.id, metadata: { priceCents, interval: data.interval, isActive: data.isActive } });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return failure("Another plan already uses that slug.", { slug: "Already in use" });
    throw err;
  }
  revalidatePath("/admin/memberships/plans");
  return success(planId ? "Plan saved. Existing members keep their current price." : "Plan created.");
}
