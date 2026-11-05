import type { AppointmentStatus, Role } from "@prisma/client";

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  REQUESTED: "Requested",
  CONFIRMED: "Confirmed",
  ASSIGNED: "Assigned",
  EN_ROUTE: "En Route",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
  NO_SHOW: "No-Show",
};

export const ACTIVE_STATUSES: AppointmentStatus[] = ["REQUESTED", "CONFIRMED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS"];
export const TERMINAL_STATUSES: AppointmentStatus[] = ["COMPLETED", "CANCELED", "NO_SHOW"];

/** Allowed transitions. Terminal states cannot be left except by an admin "reopen" (COMPLETED excluded). */
const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  REQUESTED: ["CONFIRMED", "ASSIGNED", "CANCELED"],
  CONFIRMED: ["ASSIGNED", "EN_ROUTE", "IN_PROGRESS", "CANCELED", "NO_SHOW"],
  ASSIGNED: ["CONFIRMED", "EN_ROUTE", "IN_PROGRESS", "CANCELED", "NO_SHOW"],
  EN_ROUTE: ["IN_PROGRESS", "ASSIGNED", "CANCELED", "NO_SHOW"],
  IN_PROGRESS: ["COMPLETED", "EN_ROUTE"],
  COMPLETED: [],
  CANCELED: ["REQUESTED"],
  NO_SHOW: ["REQUESTED"],
};

/** Statuses a technician may set on their own appointments from the field. */
const TECHNICIAN_TARGETS: AppointmentStatus[] = ["EN_ROUTE", "IN_PROGRESS", "COMPLETED", "NO_SHOW"];

export function canTransition(from: AppointmentStatus, to: AppointmentStatus, role: Role): boolean {
  if (from === to) return false;
  if (!TRANSITIONS[from].includes(to)) return false;
  if (role === "TECHNICIAN") return TECHNICIAN_TARGETS.includes(to) && from !== "REQUESTED";
  if (role === "CUSTOMER") return to === "CANCELED" && (from === "REQUESTED" || from === "CONFIRMED" || from === "ASSIGNED");
  return role === "OWNER" || role === "ADMIN" || role === "DISPATCHER";
}

export function allowedNextStatuses(from: AppointmentStatus, role: Role): AppointmentStatus[] {
  return TRANSITIONS[from].filter((to) => canTransition(from, to, role));
}

export function isActive(status: AppointmentStatus) {
  return ACTIVE_STATUSES.includes(status);
}

/** Customers may self-reschedule/cancel only before the free-cancellation cutoff. */
export function canCustomerModify(params: {
  status: AppointmentStatus;
  startsAt: Date;
  now: Date;
  freeCancellationHours: number;
}): { allowed: boolean; reason?: string } {
  if (!["REQUESTED", "CONFIRMED", "ASSIGNED"].includes(params.status)) {
    return { allowed: false, reason: "This appointment can no longer be changed online." };
  }
  const cutoff = params.startsAt.getTime() - params.freeCancellationHours * 3600_000;
  if (params.now.getTime() > cutoff) {
    return {
      allowed: false,
      reason: `Online changes are available until ${params.freeCancellationHours} hours before your appointment. Please call us and we will be glad to help.`,
    };
  }
  return { allowed: true };
}
