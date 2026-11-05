import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createBooking } from "@/lib/booking/service";
import { assertAppointmentAccess, getPortalAccess, portalAppointments, requireAccess } from "@/lib/portal/access";
import { localMinuteToUtc } from "@/lib/time";
import { createCustomer, createTechnician, createUser, resetDb, seedBasics } from "../helpers/db";

let serviceId: string;
beforeEach(async () => {
  await resetDb();
  serviceId = (await seedBasics()).service.id;
  await createTechnician();
});

async function bookFor(customerId: string, min: number) {
  return createBooking({
    serviceId,
    startsAt: localMinuteToUtc("2026-11-16", min),
    customer: { firstName: "x", lastName: "y" },
    existingCustomerId: customerId,
    address: { line1: "1 Main St", city: "Dover", state: "OH", postalCode: "44622" },
    problemDescription: "Private problem description",
    bookedForSelf: true,
    acceptedTerms: true,
    now: new Date("2026-11-10T12:00:00Z"),
  });
}

describe("customer portal authorization", () => {
  it("a customer sees only their own appointments", async () => {
    const mine = await createCustomer();
    const other = await createCustomer();
    const user = await createUser("CUSTOMER", { customerId: mine.id });
    const a = await bookFor(mine.id, 540);
    const b = await bookFor(other.id, 720);
    const list = await portalAppointments(user);
    expect(list.map((x) => x.id)).toEqual([a.appointmentId]);
    await expect(assertAppointmentAccess(user, b.appointmentId, "view")).rejects.toThrow();
    await expect(assertAppointmentAccess(user, b.appointmentId, "schedule")).rejects.toThrow();
  });

  it("a paying family member does not see private service details", async () => {
    const parent = await createCustomer();
    const child = await createUser("CUSTOMER");
    await prisma.familyContact.create({ data: { customerId: parent.id, name: "Child", userId: child.id, canPay: true, canReceiveUpdates: true, canSchedule: false, canViewServiceDetails: false } });
    await bookFor(parent.id, 540);
    const list = await portalAppointments(child);
    expect(list).toHaveLength(1);
    expect(list[0].problemDescription).toBeNull();
    expect(list[0].location).toBe("Dover");
    expect(list[0].canChange).toBe(false);
    await expect(requireAccess(child, parent.id, "details")).rejects.toThrow();
    await expect(requireAccess(child, parent.id, "schedule")).rejects.toThrow();
    await expect(requireAccess(child, parent.id, "pay")).resolves.toBeTruthy();
  });

  it("a payer-only family member with no update permission sees no appointments", async () => {
    const parent = await createCustomer();
    const child = await createUser("CUSTOMER");
    await prisma.familyContact.create({ data: { customerId: parent.id, name: "Payer", userId: child.id, canPay: true } });
    await bookFor(parent.id, 540);
    expect(await portalAppointments(child)).toHaveLength(0);
    expect((await getPortalAccess(child))[0].canPay).toBe(true);
  });

  it("a family member granted details and scheduling can see and change", async () => {
    const parent = await createCustomer();
    const child = await createUser("CUSTOMER");
    await prisma.familyContact.create({ data: { customerId: parent.id, name: "Helper", userId: child.id, canSchedule: true, canViewServiceDetails: true } });
    const a = await bookFor(parent.id, 540);
    const list = await portalAppointments(child);
    expect(list[0].problemDescription).toBe("Private problem description");
    expect(list[0].canChange).toBe(true);
    await expect(assertAppointmentAccess(child, a.appointmentId, "schedule")).resolves.toBeTruthy();
  });
});
