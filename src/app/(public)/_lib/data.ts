import "server-only";
import { prisma } from "@/lib/db";

/** Active services in display order. */
export function getActiveServices() {
  return prisma.service.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
}

export function getServiceBySlug(slug: string) {
  return prisma.service.findFirst({ where: { slug, isActive: true } });
}

export function getActiveServiceAreas() {
  return prisma.serviceArea.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { county: "asc" }] });
}

export function getKindredCarePlan() {
  return prisma.membershipPlan.findFirst({ where: { slug: "kindred-care", isActive: true } });
}
