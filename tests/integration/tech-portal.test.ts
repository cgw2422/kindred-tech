import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { changeAppointmentStatus, createBooking, type BookingRequest } from "@/lib/booking/service";
import { localMinuteToUtc } from "@/lib/time";
import { assertOwnedAppointment, getTechJob, listTechAppointments } from "@/lib/tech/access";
import {
  addAdditionalWork,
  completeJob,
  requestInvoice,
  saveNotes,
  saveSignature,
  startTimer,
  stopTimer,
  updateChecklist,
  updateJobStatus,
  type TechActor,
} from "@/lib/tech/workorders";
import { addSubscriptionItem, authorizeSubscriptionReview, removeSubscriptionItem, updateSubscriptionItem } from "@/lib/tech/subscription-review";
import { createInvoiceForWorkOrder } from "@/lib/tech/admin-work-orders";
import { signatureProblem } from "@/lib/tech/signature";
import { createTechnician, resetDb, seedBasics } from "../helpers/db";

const DAY = "2026-11-16";
const NOW = new Date("2026-11-10T12:00:00Z");
const at = (min: number) => localMinuteToUtc(DAY, min);
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

let serviceId: string;
let a: TechActor;
let b: TechActor;

async function book(technicianId: string, startMin = 600, overrides: Partial<BookingRequest> = {}) {
  const r = await createBooking({
    serviceId,
    startsAt: at(startMin),
    customer: { firstName: "Mary", lastName: "Smith", email: `mary-${Math.random()}@example.com`, phone: "330-555-0100" },
    address: { line1: "1 Main St", city: "Dover", state: "OH", postalCode: "44622", accessNotes: "Side door" },
    bookedForSelf: true,
    acceptedTerms: true,
    now: NOW,
    technicianId,
    statusOverride: "CONFIRMED",
    source: "ADMIN",
    ...overrides,
  });
  return r.appointmentId;
}

async function toInProgress(actor: TechActor, id: string) {
  await updateJobStatus(actor, id, "IN_PROGRESS");
}

beforeEach(async () => {
  await resetDb();
  const { service } = await seedBasics();
  serviceId = service.id;
  const t1 = await createTechnician("Alice");
  const t2 = await createTechnician("Bob");
  a = { userId: t1.userId, technicianId: t1.id };
  b = { userId: t2.userId, technicianId: t2.id };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("technician access isolation", () => {
  it("a technician cannot read another technician's appointment", async () => {
    const id = await book(a.technicianId);
    expect(await getTechJob(a.technicianId, id)).not.toBeNull();
    expect(await getTechJob(b.technicianId, id)).toBeNull();
    expect(await getTechJob("", id)).toBeNull();
    await expect(assertOwnedAppointment(b.technicianId, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await listTechAppointments(a.technicianId, DAY, 1, "America/New_York")).toHaveLength(1);
    expect(await listTechAppointments(b.technicianId, DAY, 1, "America/New_York")).toHaveLength(0);
  });

  it("a technician cannot modify another technician's appointment", async () => {
    const id = await book(a.technicianId);
    await expect(updateJobStatus(b, id, "EN_ROUTE")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(startTimer(b, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(saveNotes(b, id, { troubleshootingNotes: "x", resolutionSummary: "y" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateChecklist(b, id, { doneIndexes: [0] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      addAdditionalWork(b, id, { description: "x", minutes: 10, priceCents: 100, approvedByName: "Mary", approvalMethod: "VERBAL", customerApproved: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(saveSignature(b, id, { signedByName: "Mary", dataUrl: PNG })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(completeJob(b, id, {})).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(requestInvoice(b, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(authorizeSubscriptionReview(b, id, { authorizedByName: "Mary", confirmed: true, method: "VERBAL" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Even the shared service enforces ownership
    await expect(
      changeAppointmentStatus({ appointmentId: id, to: "EN_ROUTE", actor: { id: b.userId, role: "TECHNICIAN" }, technicianId: b.technicianId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const appt = await prisma.appointment.findUniqueOrThrow({ where: { id }, include: { workOrder: true } });
    expect(appt.status).toBe("CONFIRMED");
    expect(appt.workOrder).toBeNull();
  });

  it("job detail never exposes billing or internal notes", async () => {
    const id = await book(a.technicianId);
    await prisma.appointment.update({ where: { id }, data: { internalNotes: "secret admin note" } });
    const job = await getTechJob(a.technicianId, id);
    const json = JSON.stringify(job);
    expect(json).not.toContain("secret admin note");
    expect(json).not.toContain("estimatedTotalCents");
    expect(json).not.toContain("invoices");
    expect(job?.address?.accessNotes).toBe("Side door");
  });

  it("only shows family contacts who may receive updates or schedule", async () => {
    const id = await book(a.technicianId);
    const appt = await prisma.appointment.findUniqueOrThrow({ where: { id } });
    await prisma.familyContact.createMany({
      data: [
        { customerId: appt.customerId, name: "Updates Ursula", canReceiveUpdates: true, phone: "1" },
        { customerId: appt.customerId, name: "Payer Pete", canPay: true, isBillingContact: true, phone: "2" },
      ],
    });
    const job = await getTechJob(a.technicianId, id);
    expect(job?.customer.familyContacts.map((c) => c.name)).toEqual(["Updates Ursula"]);
  });
});

describe("work timer", () => {
  it("starts and stops; only one open entry at a time", async () => {
    const id = await book(a.technicianId, 600);
    const id2 = await book(a.technicianId, 780);
    await startTimer(a, id);
    await expect(startTimer(a, id)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(startTimer(a, id2)).rejects.toThrow(/another job/);
    await stopTimer(a, id);
    await expect(stopTimer(a, id)).rejects.toThrow(/not running/);
    await startTimer(a, id);
    await stopTimer(a, id);
    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { appointmentId: id }, include: { timeEntries: true } });
    expect(wo.timeEntries).toHaveLength(2);
    expect(wo.timeEntries.every((e) => e.endedAt)).toBe(true);
    expect(Array.isArray(wo.checklist)).toBe(true);
  });

  it("serializes concurrent starts", async () => {
    const id = await book(a.technicianId);
    const results = await Promise.allSettled([startTimer(a, id), startTimer(a, id), startTimer(a, id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.workTimeEntry.count({ where: { endedAt: null } })).toBe(1);
  });

  it("cannot start on a canceled appointment or a requested one", async () => {
    const id = await book(a.technicianId);
    await changeAppointmentStatus({ appointmentId: id, to: "CANCELED", actor: { id: null, role: "ADMIN" } });
    await expect(startTimer(a, id)).rejects.toMatchObject({ code: "INVALID" });
    const req = await book(a.technicianId, 780, { statusOverride: "REQUESTED" });
    await expect(startTimer(a, req)).rejects.toMatchObject({ code: "INVALID" });
  });
});

describe("completion", () => {
  it("requires IN_PROGRESS", async () => {
    const id = await book(a.technicianId);
    await expect(completeJob(a, id, {})).rejects.toThrow(/In Progress/);
    await updateJobStatus(a, id, "EN_ROUTE");
    await expect(completeJob(a, id, {})).rejects.toThrow(/In Progress/);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id } })).status).toBe("EN_ROUTE");
  });

  it("completes the job, closes the timer, records status and queues the email", async () => {
    const id = await book(a.technicianId);
    await toInProgress(a, id);
    await startTimer(a, id);
    await completeJob(a, id, { resolutionSummary: "Set up email on the iPad." });
    const appt = await prisma.appointment.findUniqueOrThrow({ where: { id }, include: { workOrder: { include: { timeEntries: true } } } });
    expect(appt.status).toBe("COMPLETED");
    expect(appt.workOrder?.status).toBe("COMPLETED");
    expect(appt.workOrder?.completedAt).toBeTruthy();
    expect(appt.workOrder?.resolutionSummary).toBe("Set up email on the iPad.");
    expect(appt.workOrder?.timeEntries.every((e) => e.endedAt)).toBe(true);
    expect(await prisma.communication.count({ where: { relatedId: id, templateKey: "appointment_completed" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "workorder.completed" } })).toBe(1);
    await expect(startTimer(a, id)).rejects.toMatchObject({ code: "INVALID" });
    await requestInvoice(a, id);
    expect((await prisma.workOrder.findUniqueOrThrow({ where: { appointmentId: id } })).invoiceRequestedAt).toBeTruthy();
  });

  it("invoice can only be requested after completion", async () => {
    const id = await book(a.technicianId);
    await toInProgress(a, id);
    await expect(requestInvoice(a, id)).rejects.toThrow(/Complete the job/);
  });

  it("status button for COMPLETED goes through the completion flow", async () => {
    const id = await book(a.technicianId);
    await toInProgress(a, id);
    await updateJobStatus(a, id, "COMPLETED");
    expect((await prisma.workOrder.findUniqueOrThrow({ where: { appointmentId: id } })).status).toBe("COMPLETED");
  });
});

describe("signature", () => {
  it("validates the PNG data URL", () => {
    expect(signatureProblem(PNG)).toBeNull();
    expect(signatureProblem("data:image/jpeg;base64,/9j/4AAQ")).toMatch(/PNG/);
    expect(signatureProblem("data:image/png;base64,")).toMatch(/empty/);
    expect(signatureProblem("data:image/png;base64,not base64!!")).toMatch(/not valid/);
    expect(signatureProblem("data:image/png;base64," + Buffer.from("hello world").toString("base64"))).toMatch(/not valid/);
    const big = "data:image/png;base64," + Buffer.concat([Buffer.from(PNG.split(",")[1], "base64"), Buffer.alloc(210 * 1024)]).toString("base64");
    expect(signatureProblem(big)).toMatch(/too large/);
  });

  it("stores signature and a SERVICE_AUTHORIZATION consent", async () => {
    const id = await book(a.technicianId);
    await expect(saveSignature(a, id, { signedByName: "Mary Smith", dataUrl: "data:image/gif;base64,R0lG" })).rejects.toMatchObject({ code: "INVALID" });
    await expect(saveSignature(a, id, { signedByName: "", dataUrl: PNG })).rejects.toMatchObject({ code: "INVALID" });
    await expect(saveSignature(a, id, { signedByName: "Mary Smith", dataUrl: null })).rejects.toMatchObject({ code: "INVALID" });
    await saveSignature(a, id, { signedByName: "Mary Smith", dataUrl: PNG });
    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { appointmentId: id } });
    expect(wo.signatureDataUrl).toBe(PNG);
    expect(wo.signedByName).toBe("Mary Smith");
    expect(wo.signedAt).toBeTruthy();
    const consent = await prisma.consentRecord.findFirstOrThrow({ where: { appointmentId: id, type: "SERVICE_AUTHORIZATION" } });
    expect(consent).toMatchObject({ method: "SIGNATURE", grantedByName: "Mary Smith", granted: true, recordedById: a.userId });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "workorder.signed" } });
    expect(JSON.stringify(log.metadata)).not.toContain("base64");
  });

  it("accepts a confirmed typed name instead of a drawing", async () => {
    const id = await book(a.technicianId);
    await saveSignature(a, id, { signedByName: "Mary Smith", dataUrl: null, typedConfirmed: true });
    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { appointmentId: id } });
    expect(wo.signatureDataUrl).toBeNull();
    expect(wo.signedByName).toBe("Mary Smith");
  });
});

describe("additional work", () => {
  const base = { description: "Set up printer", minutes: 30, priceCents: 4000, approvedByName: "Mary Smith", approvalMethod: "VERBAL" as const };

  it("requires customer approval confirmation and an approver name", async () => {
    const id = await book(a.technicianId);
    await expect(addAdditionalWork(a, id, { ...base, customerApproved: false })).rejects.toThrow(/approved this cost/);
    await expect(addAdditionalWork(a, id, { ...base, approvedByName: " ", customerApproved: true })).rejects.toThrow(/who approved/);
    await expect(addAdditionalWork(a, id, { ...base, priceCents: -5, customerApproved: true })).rejects.toThrow(/valid price/);
    expect(await prisma.additionalWorkItem.count()).toBe(0);
    await addAdditionalWork(a, id, { ...base, customerApproved: true });
    expect(await prisma.additionalWorkItem.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "workorder.additional_work" } })).toBe(1);
  });

  it("is included on the admin-created invoice", async () => {
    const id = await book(a.technicianId);
    await addAdditionalWork(a, id, { ...base, customerApproved: true });
    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { appointmentId: id } });
    const inv = await createInvoiceForWorkOrder(wo.id, a.userId);
    expect(inv.lines.map((l) => l.kind)).toContain("ADDITIONAL_WORK");
    expect(inv.totalCents).toBe(9900 + 4000);
    await expect(createInvoiceForWorkOrder(wo.id, a.userId)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("checklist", () => {
  it("ticks items and adds custom ones", async () => {
    const id = await book(a.technicianId);
    const items = await updateChecklist(a, id, { doneIndexes: [0, 2], addLabel: "Set up large text" });
    expect(items[0].done).toBe(true);
    expect(items[1].done).toBe(false);
    expect(items.at(-1)).toEqual({ label: "Set up large text", done: false });
  });
});

describe("subscription review", () => {
  const item = {
    name: "StreamFlix",
    category: "STREAMING" as const,
    priceCents: 12000,
    frequency: "ANNUAL" as const,
    decision: "CANCEL" as const,
    cancellationAssisted: true,
    estimatedMonthlySavingsCents: null,
    followUpNeeded: false,
    followUpNotes: null,
  };

  it("requires authorization before items can be added", async () => {
    const id = await book(a.technicianId);
    await expect(addSubscriptionItem(a, id, item)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(authorizeSubscriptionReview(a, id, { authorizedByName: "Mary", confirmed: false, method: "VERBAL" })).rejects.toMatchObject({ code: "INVALID" });
    await expect(addSubscriptionItem(a, id, item)).rejects.toMatchObject({ code: "FORBIDDEN" });

    await authorizeSubscriptionReview(a, id, { authorizedByName: "Mary Smith", confirmed: true, method: "VERBAL" });
    const consent = await prisma.consentRecord.findFirstOrThrow({ where: { appointmentId: id, type: "SUBSCRIPTION_CHANGES" } });
    expect(consent.grantedByName).toBe("Mary Smith");

    const created = await addSubscriptionItem(a, id, item);
    expect(created.estimatedMonthlySavingsCents).toBe(1000); // auto-suggested 12000 / 12
    const updated = await updateSubscriptionItem(a, id, created.id, { ...item, decision: "DOWNGRADE", estimatedMonthlySavingsCents: 400 });
    expect(updated.estimatedMonthlySavingsCents).toBe(400);
    await expect(updateSubscriptionItem(a, id, created.id, { ...item, estimatedMonthlySavingsCents: 5000 })).rejects.toThrow(/cannot be more/);

    // Another technician cannot touch it
    await expect(updateSubscriptionItem(b, id, created.id, item)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(removeSubscriptionItem(b, id, created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Item ids from another review are rejected
    const id2 = await book(a.technicianId, 780);
    await authorizeSubscriptionReview(a, id2, { authorizedByName: "Mary Smith", confirmed: true, method: "VERBAL" });
    await expect(removeSubscriptionItem(a, id2, created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await removeSubscriptionItem(a, id, created.id);
    expect(await prisma.subscriptionItem.count()).toBe(0);
  });
});
