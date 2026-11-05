"use server";

import { redirect } from "next/navigation";
import { prisma } from "../db";
import { env } from "../env";
import { requireUser } from "../auth/session";
import { fd } from "../forms";
import { rateLimit } from "../rate-limit";
import { createMembership, MembershipError } from "../memberships/service";
import { getInvoiceForUser, membershipPurchaseTargets, safePortalPath } from "./portal";
import { createBillingPortalSession, createInvoiceCheckoutSession, createMembershipCheckoutSession, isStripeConfigured } from "./stripe";

/**
 * Portal billing server actions. Each re-checks the signed-in user's access on
 * the server; hidden buttons are not authorization.
 */

function withParam(path: string, key: string, value: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}

function errorMessage(err: unknown) {
  const e = err as Error;
  if (["InvoiceError", "PaymentError", "PaymentsNotConfiguredError", "MembershipError"].includes(e?.name)) return e.message;
  console.error("[portal billing]", e?.message);
  return "Something went wrong starting the payment. Please try again or contact us.";
}

/** Starts Stripe Checkout for an invoice the user may pay. */
export async function portalPayInvoiceAction(formData: FormData) {
  const returnPath = safePortalPath(fd(formData, "returnPath"));
  const user = await requireUser(returnPath);
  const invoiceId = fd(formData, "invoiceId");
  let url: string;
  try {
    if (!isStripeConfigured()) throw new MembershipError("Online card payment is not available yet. Please contact us to pay by check or cash.");
    if (!(await rateLimit(`portal-pay:${user.id}`, 10, 600))) throw new MembershipError("Too many attempts. Please wait a few minutes and try again.");
    const inv = await getInvoiceForUser(user, invoiceId);
    if (!inv) throw new MembershipError("Invoice not found.");
    const session = await createInvoiceCheckoutSession(inv.id, { returnTo: withParam(`${env.appUrl}${returnPath}`, "invoice", inv.id), payDeposit: fd(formData, "deposit") === "1" });
    url = session.url;
  } catch (err) {
    redirect(withParam(returnPath, "billingError", errorMessage(err)));
  }
  redirect(url);
}

/**
 * Starts a membership subscription checkout for the signed-in customer, or
 * for a customer who has authorized this user (a family member) to pay.
 */
export async function portalStartMembershipCheckoutAction(formData: FormData) {
  const returnPath = safePortalPath(fd(formData, "returnPath"));
  const user = await requireUser(returnPath);
  const planId = fd(formData, "planId");
  const requestedCustomerId = fd(formData, "customerId") || user.customerId || "";
  let url: string;
  try {
    if (!isStripeConfigured()) throw new MembershipError("Online membership sign-up is not available yet. Please contact us to join.");
    if (!(await rateLimit(`portal-membership:${user.id}`, 10, 600))) throw new MembershipError("Too many attempts. Please wait a few minutes and try again.");
    const target = (await membershipPurchaseTargets(user)).find((t) => t.customerId === requestedCustomerId);
    if (!target) throw new MembershipError("You are not authorized to buy a membership for this person.");
    const pending = await prisma.membership.findFirst({ where: { customerId: target.customerId, status: "PENDING", planId, stripeSubscriptionId: null } });
    const membership =
      pending ??
      (await createMembership({ customerId: target.customerId, planId, purchaserContactId: target.purchaserContactId, actorUserId: user.id }));
    const session = await createMembershipCheckoutSession(membership.id, { returnTo: `${env.appUrl}${returnPath}` });
    url = session.url;
  } catch (err) {
    redirect(withParam(returnPath, "billingError", errorMessage(err)));
  }
  redirect(url);
}

/** Opens the Stripe Billing Portal (update card, view receipts, cancel) for the account holder. */
export async function portalOpenBillingPortalAction(formData: FormData) {
  const returnPath = safePortalPath(fd(formData, "returnPath"));
  const user = await requireUser(returnPath);
  let url: string;
  try {
    if (!user.customerId) throw new MembershipError("Only the account holder can manage saved payment details. Please contact us for help.");
    url = await createBillingPortalSession(user.customerId, `${env.appUrl}${returnPath}`);
  } catch (err) {
    redirect(withParam(returnPath, "billingError", errorMessage(err)));
  }
  redirect(url);
}
