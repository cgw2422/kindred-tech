import { prisma } from "../db";
import { getSettings } from "../settings";
import { notifyAppointment } from "../booking/service";
import { queueTemplatedEmail } from "../email/send";
import { enqueueJob, registerJobHandler } from "./queue";

/**
 * Periodic maintenance and notification jobs. Each is idempotent: running it
 * twice never sends duplicate messages (communication idempotency keys).
 */

/** Sends one reminder per appointment, `reminderHoursBefore` ahead of the start. */
export async function sendAppointmentReminders(now = new Date()) {
  const n = await getSettings("notifications");
  if (!n.sendReminders) return { queued: 0 };
  const windowEnd = new Date(now.getTime() + n.reminderHoursBefore * 3600_000);
  const due = await prisma.appointment.findMany({
    where: { status: { in: ["CONFIRMED", "ASSIGNED"] }, startsAt: { gt: now, lte: windowEnd } },
    select: { id: true, startsAt: true },
  });
  for (const a of due) await notifyAppointment(a.id, "appointment_reminder", {}, `reminder:${a.startsAt.toISOString()}`);
  return { queued: due.length };
}

/** Optional review request the day after a completed visit (only when enabled with a review URL). */
export async function sendReviewRequests(now = new Date()) {
  const n = await getSettings("notifications");
  if (!n.sendReviewRequests || !n.reviewUrl) return { queued: 0 };
  const from = new Date(now.getTime() - 3 * 86400_000);
  const to = new Date(now.getTime() - 20 * 3600_000);
  const done = await prisma.workOrder.findMany({ where: { completedAt: { gte: from, lte: to } }, include: { appointment: { include: { customer: true } } } });
  let queued = 0;
  for (const w of done) {
    const c = w.appointment.customer;
    if (!c.email) continue;
    const r = await queueTemplatedEmail({
      templateKey: "review_request",
      to: c.email,
      customerId: c.id,
      vars: { customerName: c.preferredName || c.firstName, reviewUrl: n.reviewUrl },
      idempotencyKey: `review:${w.appointmentId}`,
      relatedType: "Appointment",
      relatedId: w.appointmentId,
    });
    if (r.queued) queued++;
  }
  return { queued };
}

/** Applies the data retention settings and cleans expired security records. */
export async function applyRetention(now = new Date()) {
  const p = await getSettings("privacy");
  const day = 86400_000;
  const [sessions, tokens, hits, jobs, comms, audits] = await prisma.$transaction([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.authToken.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - day) } } }),
    prisma.rateLimitHit.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - day) } } }),
    prisma.job.deleteMany({ where: { status: "SUCCEEDED", completedAt: { lt: new Date(now.getTime() - p.jobRetentionDays * day) } } }),
    prisma.communication.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - p.communicationRetentionDays * day) } } }),
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - p.auditRetentionDays * day) } } }),
  ]);
  return { sessions: sessions.count, tokens: tokens.count, rateLimitHits: hits.count, jobs: jobs.count, communications: comms.count, auditLogs: audits.count };
}

registerJobHandler("appointments.reminders", async () => {
  await sendAppointmentReminders();
});
registerJobHandler("appointments.review-requests", async () => {
  await sendReviewRequests();
});
registerJobHandler("maintenance.retention", async () => {
  await applyRetention();
});

/**
 * Enqueues periodic jobs. Idempotency keys bucket by time so calling this every
 * minute from several processes still creates each job once per period.
 */
export async function schedulePeriodicJobs(now = new Date()) {
  const hour = now.toISOString().slice(0, 13);
  const quarter = `${hour}:${Math.floor(now.getUTCMinutes() / 15)}`;
  const dayKey = now.toISOString().slice(0, 10);
  await enqueueJob("appointments.reminders", {}, { idempotencyKey: `periodic:reminders:${quarter}`, maxAttempts: 3 });
  await enqueueJob("appointments.review-requests", {}, { idempotencyKey: `periodic:reviews:${hour}`, maxAttempts: 3 });
  await enqueueJob("facility.renewal-reminders", {}, { idempotencyKey: `periodic:renewals:${dayKey}`, maxAttempts: 3 });
  await enqueueJob("maintenance.retention", {}, { idempotencyKey: `periodic:retention:${dayKey}`, maxAttempts: 3 });
}
