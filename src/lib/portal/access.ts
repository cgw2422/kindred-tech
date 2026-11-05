import { prisma } from "../db";

/**
 * Customer-portal authorization. A portal user may act for:
 *  - their own customer record (User.customerId): full access to own data
 *  - customers who listed them as an authorized FamilyContact (FamilyContact.userId),
 *    limited to the permissions that customer granted.
 * Paying (canPay) never implies access to private service details.
 */
export type PortalAccess = {
  customerId: string;
  name: string;
  self: boolean;
  canSchedule: boolean;
  canPay: boolean;
  canViewServiceDetails: boolean;
  canReceiveUpdates: boolean;
  familyContactId: string | null;
};

export async function getPortalAccess(user: { id: string; customerId: string | null }): Promise<PortalAccess[]> {
  const out: PortalAccess[] = [];
  if (user.customerId) {
    const c = await prisma.customer.findUnique({ where: { id: user.customerId } });
    if (c) out.push({ customerId: c.id, name: `${c.firstName} ${c.lastName}`, self: true, canSchedule: true, canPay: true, canViewServiceDetails: true, canReceiveUpdates: true, familyContactId: null });
  }
  const links = await prisma.familyContact.findMany({ where: { userId: user.id }, include: { customer: true } });
  for (const l of links) {
    if (out.some((o) => o.customerId === l.customerId)) continue;
    out.push({
      customerId: l.customerId,
      name: `${l.customer.firstName} ${l.customer.lastName}`,
      self: false,
      canSchedule: l.canSchedule,
      canPay: l.canPay,
      canViewServiceDetails: l.canViewServiceDetails,
      canReceiveUpdates: l.canReceiveUpdates,
      familyContactId: l.id,
    });
  }
  return out;
}

export class PortalAccessError extends Error {
  constructor(message = "You do not have access to that.") {
    super(message);
    this.name = "PortalAccessError";
  }
}

export async function requireAccess(user: { id: string; customerId: string | null }, customerId: string, need: "view" | "schedule" | "pay" | "details"): Promise<PortalAccess> {
  const access = (await getPortalAccess(user)).find((a) => a.customerId === customerId);
  if (!access) throw new PortalAccessError();
  const ok =
    need === "view"
      ? access.self || access.canSchedule || access.canReceiveUpdates || access.canViewServiceDetails
      : need === "schedule"
        ? access.canSchedule
        : need === "pay"
          ? access.canPay
          : access.canViewServiceDetails;
  if (!ok) throw new PortalAccessError();
  return access;
}

/**
 * Appointments visible in the portal. Family members without service-detail
 * permission see date/time/service/status only (no problem description or notes).
 */
export async function portalAppointments(user: { id: string; customerId: string | null }) {
  const access = (await getPortalAccess(user)).filter((a) => a.self || a.canSchedule || a.canReceiveUpdates || a.canViewServiceDetails);
  if (access.length === 0) return [];
  const appts = await prisma.appointment.findMany({
    where: { customerId: { in: access.map((a) => a.customerId) } },
    include: { service: true, address: true, technician: { select: { displayName: true } }, workOrder: { select: { resolutionSummary: true } } },
    orderBy: { startsAt: "desc" },
    take: 100,
  });
  return appts.map((a) => {
    const acc = access.find((x) => x.customerId === a.customerId)!;
    const details = acc.canViewServiceDetails;
    return {
      id: a.id,
      customerId: a.customerId,
      customerName: acc.name,
      self: acc.self,
      canChange: acc.canSchedule,
      reference: a.reference,
      status: a.status,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      serviceId: a.serviceId,
      serviceName: a.service.name,
      isRemote: a.isRemote,
      extensionBlocks: a.extensionBlocks,
      technicianName: a.technician?.displayName ?? null,
      location: a.isRemote ? "Remote" : a.address ? (details ? `${a.address.line1}, ${a.address.city}` : a.address.city) : null,
      problemDescription: details ? a.problemDescription : null,
      visitSummary: details ? (a.workOrder?.resolutionSummary ?? null) : null,
      estimatedTotalCents: acc.canPay || acc.self ? a.estimatedTotalCents : null,
    };
  });
}

export async function assertAppointmentAccess(user: { id: string; customerId: string | null }, appointmentId: string, need: "view" | "schedule") {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt) throw new PortalAccessError("Appointment not found.");
  await requireAccess(user, appt.customerId, need);
  return appt;
}
