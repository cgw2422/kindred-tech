"use server";

import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { type ActionState, failure, fd, success } from "@/lib/forms";
import { rateLimit } from "@/lib/rate-limit";

export async function confirmUnsubscribe(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const token = fd(formData, "token");
  if (!token || token.length > 100) return failure("This unsubscribe link is not valid.");

  const ip = await clientIp();
  if (!(await rateLimit(`unsubscribe:${ip ?? "unknown"}`, 20, 3600))) {
    return failure("Too many requests. Please try again later.");
  }

  const customer = await prisma.customer.findUnique({ where: { unsubscribeToken: token }, select: { id: true, marketingOptIn: true } });
  if (!customer) return failure("We could not find this unsubscribe link. It may be out of date. Please contact us and we will update your preferences.");

  await prisma.$transaction([
    prisma.customer.update({ where: { id: customer.id }, data: { marketingOptIn: false, marketingOptInAt: null } }),
    prisma.consentRecord.create({
      data: { customerId: customer.id, type: "MARKETING_EMAIL", granted: false, method: "EMAIL", notes: "Unsubscribed using the link in an email." },
    }),
  ]);
  await audit({ action: "customer.marketing_unsubscribe", entityType: "Customer", entityId: customer.id, ip });

  return success("You have been unsubscribed from marketing emails.");
}
