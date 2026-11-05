"use server";

import { clientIp } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { fd, fdBool, fdOptional, type ActionState } from "@/lib/forms";
import { FacilityError } from "@/lib/facilities/errors";
import { bookHelpDaySlot } from "@/lib/facilities/help-days";
import { runDueJobs } from "@/lib/jobs/queue";
import "@/lib/email/send";

export async function reserveHelpDaySlotAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (fd(formData, "website")) return { ok: false, error: "Unable to submit." }; // honeypot
  const ip = (await clientIp()) ?? "unknown";
  if (!(await rateLimit(`helpday-signup:${ip}`, 10, 3600))) {
    return { ok: false, error: "We received several sign-ups from this connection. Please ask your community's front desk or call us to reserve a time." };
  }
  const helpDayId = fd(formData, "helpDayId");
  const startsAt = new Date(fd(formData, "startsAt"));
  if (!fd(formData, "startsAt") || Number.isNaN(startsAt.getTime())) return { ok: false, error: "Please choose a time.", fieldErrors: { startsAt: "Please choose a time." } };
  const forFamily = fdBool(formData, "forFamily");
  if (forFamily && !fd(formData, "requesterName")) return { ok: false, error: "Please enter your own name as the family member making the reservation." };
  try {
    const r = await bookHelpDaySlot({
      helpDayId,
      startsAt,
      resident: {
        firstName: fd(formData, "firstName"),
        lastName: fd(formData, "lastName"),
        unit: fdOptional(formData, "unit"),
        phone: fdOptional(formData, "phone"),
        email: fdOptional(formData, "email"),
      },
      requester: forFamily
        ? { name: fd(formData, "requesterName"), phone: fdOptional(formData, "requesterPhone"), email: fdOptional(formData, "requesterEmail"), relationship: fdOptional(formData, "requesterRelation") }
        : null,
      problemDescription: fdOptional(formData, "problemDescription"),
      acceptedTerms: fdBool(formData, "acceptedTerms"),
      channel: "PUBLIC",
    });
    await runDueJobs({ limit: 5 }).catch(() => undefined);
    return { ok: true, message: "Your time is reserved.", data: { reference: r.reference, startsAt: startsAt.toISOString() } };
  } catch (err) {
    if (err instanceof FacilityError) return { ok: false, error: err.message, data: { code: err.code } };
    console.error("[help-day signup] failed", (err as Error).message);
    return { ok: false, error: "Something went wrong while saving your time. Please try again or ask the front desk to call us." };
  }
}
