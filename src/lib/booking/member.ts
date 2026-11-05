import { prisma } from "../db";

/**
 * Member discount for an estimate. Only applies when an ACTIVE membership
 * exists for a customer with that email. The final price is always confirmed
 * by staff, so this lookup only affects the displayed estimate.
 */
export async function getActiveMemberDiscount(email: string): Promise<number> {
  const e = email.trim().toLowerCase();
  if (!e) return 0;
  const membership = await prisma.membership.findFirst({
    where: { status: "ACTIVE", customer: { email: { equals: e, mode: "insensitive" } } },
    include: { plan: true },
  });
  return membership?.plan.inHomeDiscountPercent ?? 0;
}

export async function getActiveMemberDiscountForCustomer(customerId: string): Promise<number> {
  const membership = await prisma.membership.findFirst({ where: { status: "ACTIVE", customerId }, include: { plan: true } });
  return membership?.plan.inHomeDiscountPercent ?? 0;
}
