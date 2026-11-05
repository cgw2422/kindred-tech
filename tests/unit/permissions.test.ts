import { describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { PERMISSIONS, ROLE_PERMISSIONS, can, isStaff } from "@/lib/auth/permissions";

const ADMIN_PERMS = PERMISSIONS.filter((p) => !p.endsWith(":portal"));

describe("role permissions", () => {
  it.each<Role>(["TECHNICIAN", "CUSTOMER", "FACILITY_CONTACT"])("%s has no admin permissions", (role) => {
    for (const p of ADMIN_PERMS) expect(can(role, p), `${role} should not have ${p}`).toBe(false);
    expect(isStaff(role)).toBe(false);
  });

  it("each non-staff role only has its own portal", () => {
    expect(ROLE_PERMISSIONS.TECHNICIAN).toEqual(["tech:portal"]);
    expect(ROLE_PERMISSIONS.CUSTOMER).toEqual(["customer:portal"]);
    expect(ROLE_PERMISSIONS.FACILITY_CONTACT).toEqual(["facility:portal"]);
  });

  it("dispatcher cannot manage settings, billing, users, services, templates or view audit", () => {
    for (const p of ["settings:manage", "billing:manage", "billing:refund", "users:manage", "services:manage", "technicians:manage", "templates:manage", "audit:view"] as const) {
      expect(can("DISPATCHER", p), p).toBe(false);
    }
    expect(can("DISPATCHER", "appointments:manage")).toBe(true);
    expect(can("DISPATCHER", "communications:view")).toBe(true);
  });

  it("only the owner can manage users", () => {
    expect(can("OWNER", "users:manage")).toBe(true);
    expect(can("ADMIN", "users:manage")).toBe(false);
    expect(can("ADMIN", "settings:manage")).toBe(true);
    expect(can("ADMIN", "audit:view")).toBe(true);
  });

  it("owner has every staff permission", () => {
    for (const p of ADMIN_PERMS) expect(can("OWNER", p), p).toBe(true);
  });

  it("missing role has no permissions", () => {
    expect(can(null, "dashboard:view")).toBe(false);
    expect(can(undefined, "customer:portal")).toBe(false);
  });
});
