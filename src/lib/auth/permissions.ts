import type { Role } from "@prisma/client";

/**
 * Role-based permissions. Server code must check permissions on every
 * protected read and mutation. Hiding UI is not authorization.
 */
export const PERMISSIONS = [
  "dashboard:view",
  "appointments:view",
  "appointments:manage",
  "customers:view",
  "customers:manage",
  "services:manage",
  "technicians:manage",
  "dispatch:manage",
  "billing:view",
  "billing:manage",
  "billing:refund",
  "memberships:manage",
  "facilities:view",
  "facilities:manage",
  "communications:view",
  "templates:manage",
  "reports:view",
  "settings:manage",
  "users:manage",
  "audit:view",
  "website:manage",
  "tech:portal",
  "customer:portal",
  "facility:portal",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL_STAFF: Permission[] = PERMISSIONS.filter((p) => !p.endsWith(":portal"));

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: [...ALL_STAFF, "tech:portal"],
  ADMIN: [...ALL_STAFF.filter((p) => p !== "users:manage"), "tech:portal"],
  DISPATCHER: [
    "dashboard:view",
    "appointments:view",
    "appointments:manage",
    "customers:view",
    "customers:manage",
    "dispatch:manage",
    "facilities:view",
    "communications:view",
    "billing:view",
  ],
  // Technicians only see their own assigned work through the technician portal.
  TECHNICIAN: ["tech:portal"],
  CUSTOMER: ["customer:portal"],
  FACILITY_CONTACT: ["facility:portal"],
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function isStaff(role: Role | null | undefined): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "DISPATCHER";
}

export function homePathForRole(role: Role): string {
  switch (role) {
    case "OWNER":
    case "ADMIN":
    case "DISPATCHER":
      return "/admin";
    case "TECHNICIAN":
      return "/tech";
    case "FACILITY_CONTACT":
      return "/facility";
    default:
      return "/portal";
  }
}
