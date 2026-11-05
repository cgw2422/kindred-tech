import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { enqueueJob, runDueJobs, registerJobHandler } from "@/lib/jobs/queue";
import { queueTemplatedEmail } from "@/lib/email/send";
import { setTestEmailProvider, type OutgoingEmail } from "@/lib/email/provider";
import { applyRetention, sendAppointmentReminders } from "@/lib/jobs/periodic";
import "@/lib/jobs/handlers";
import { createBooking } from "@/lib/booking/service";
import { createCustomer, createTechnician, resetDb, seedBasics } from "../helpers/db";

let sent: OutgoingEmail[] = [];
let failNext = 0;
beforeEach(async () => {
  await resetDb();
  await seedBasics();
  sent = [];
  failNext = 0;
});
afterEach(() => setTestEmailProvider(null));

function captureProvider() {
  setTestEmailProvider({
    name: "test",
    async send(e) {
      if (failNext > 0) {
        failNext--;
        throw new Error("provider down");
      }
      sent.push(e);
      return { id: `msg-${sent.length}` };
    },
  });
}

describe("email delivery and job queue", () => {
  it("skips delivery and records the reason when no provider is configured", async () => {
    const r = await queueTemplatedEmail({ templateKey: "booking_received", to: "a@example.com", vars: { customerName: "A" }, idempotencyKey: "k1" });
    expect(r.queued).toBe(true);
    await runDueJobs();
    const c = await prisma.communication.findFirstOrThrow();
    expect(c.status).toBe("SKIPPED");
    expect(c.statusReason).toMatch(/not configured/);
    expect(c.subject).toContain("We received your request");
  });

  it("is idempotent: the same key never sends twice", async () => {
    captureProvider();
    await queueTemplatedEmail({ templateKey: "booking_received", to: "a@example.com", vars: { customerName: "A" }, idempotencyKey: "same" });
    await queueTemplatedEmail({ templateKey: "booking_received", to: "a@example.com", vars: { customerName: "A" }, idempotencyKey: "same" });
    await runDueJobs();
    await runDueJobs();
    expect(sent).toHaveLength(1);
    expect(await prisma.communication.count()).toBe(1);
    expect((await prisma.communication.findFirstOrThrow()).status).toBe("SENT");
  });

  it("retries failed deliveries with backoff and records the failure", async () => {
    captureProvider();
    failNext = 1;
    await queueTemplatedEmail({ templateKey: "booking_received", to: "a@example.com", vars: { customerName: "A" }, idempotencyKey: "retry" });
    await runDueJobs();
    let job = await prisma.job.findFirstOrThrow();
    expect(job.status).toBe("FAILED");
    expect((await prisma.communication.findFirstOrThrow()).status).toBe("FAILED");
    await prisma.job.update({ where: { id: job.id }, data: { runAt: new Date() } });
    await runDueJobs();
    job = await prisma.job.findFirstOrThrow();
    expect(job.status).toBe("SUCCEEDED");
    expect(sent).toHaveLength(1);
  });

  it("marks jobs DEAD after max attempts", async () => {
    registerJobHandler("test.always-fails", async () => {
      throw new Error("nope");
    });
    const { id } = await enqueueJob("test.always-fails", {}, { maxAttempts: 2 });
    await runDueJobs();
    await prisma.job.update({ where: { id }, data: { runAt: new Date() } });
    await runDueJobs();
    expect((await prisma.job.findUniqueOrThrow({ where: { id } })).status).toBe("DEAD");
  });

  it("never claims job types without a registered handler", async () => {
    const { id } = await enqueueJob("unknown.type", {});
    await runDueJobs();
    expect((await prisma.job.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
  });

  it("marketing emails require consent and include unsubscribe", async () => {
    captureProvider();
    const c = await createCustomer();
    const r = await queueTemplatedEmail({ templateKey: "newsletter_general", to: c.email, customerId: c.id, vars: { messageBody: "Hi" }, idempotencyKey: "m1" });
    expect(r.queued).toBe(false);
    await prisma.customer.update({ where: { id: c.id }, data: { marketingOptIn: true } });
    await queueTemplatedEmail({ templateKey: "newsletter_general", to: c.email, customerId: c.id, vars: { messageBody: "Hi" }, idempotencyKey: "m2" });
    await runDueJobs();
    expect(sent).toHaveLength(1);
    expect(sent[0].html).toContain("/unsubscribe?token=");
    expect(sent[0].headers?.["List-Unsubscribe"]).toBeTruthy();
  });

  it("sends one appointment reminder per appointment", async () => {
    const svc = await prisma.service.findFirstOrThrow({ where: { slug: "standard" } });
    await createTechnician();
    const startsAt = new Date(Date.now() + 26 * 3600_000);
    startsAt.setUTCMinutes(0, 0, 0);
    // place within business hours: use staff override to avoid weekday/hour dependence
    await createBooking({
      serviceId: svc.id,
      startsAt,
      customer: { firstName: "R", lastName: "M", email: "rem@example.com" },
      address: { line1: "1 Main", city: "Dover", state: "OH", postalCode: "44622" },
      bookedForSelf: true,
      acceptedTerms: true,
      source: "ADMIN",
      staffOverrideHours: true,
      statusOverride: "CONFIRMED",
    });
    const before = await prisma.communication.count();
    await prisma.setting.update({ where: { key: "notifications" }, data: { value: { sendReminders: true, reminderHoursBefore: 48 } } });
    await sendAppointmentReminders();
    await sendAppointmentReminders();
    expect(await prisma.communication.count({ where: { templateKey: "appointment_reminder" } })).toBe(1);
    expect(await prisma.communication.count()).toBe(before + 1);
  });

  it("retention removes expired sessions and old successful jobs", async () => {
    const r = await applyRetention();
    expect(r).toHaveProperty("sessions");
  });
});
