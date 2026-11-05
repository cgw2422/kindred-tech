"use server";

import { BookingError, createBooking } from "@/lib/booking/service";
import { bookingSubmissionSchema } from "@/lib/booking/public";
import { clientIp, getSessionUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { zodFieldErrors } from "@/lib/forms";
import { runDueJobs } from "@/lib/jobs/queue";
import "@/lib/email/send";

export type BookingActionResult =
  | { ok: true; reference: string; manageToken: string; status: string; inServiceArea: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; code?: string };

export async function submitBookingAction(payload: unknown): Promise<BookingActionResult> {
  const parsed = bookingSubmissionSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: "Please check the highlighted information.", fieldErrors: zodFieldErrors(parsed.error) };
  }
  const v = parsed.data;
  if (v.website) return { ok: false, error: "Unable to submit." }; // honeypot
  const ip = (await clientIp()) ?? "unknown";
  if (!(await rateLimit(`booking:${ip}`, 8, 3600))) {
    return { ok: false, error: "We received several requests from this connection. Please call us or try again later." };
  }
  const user = await getSessionUser();
  try {
    const result = await createBooking({
      serviceId: v.serviceId,
      startsAt: new Date(v.startsAt),
      extensionBlocks: v.extensionBlocks,
      addonIds: v.addonIds,
      discountCode: v.discountCode || null,
      customer: { ...v.customer, email: v.customer.email || null },
      address: v.address?.line1
        ? { line1: v.address.line1, line2: v.address.line2 || null, city: v.address.city, state: v.address.state || "OH", postalCode: v.address.postalCode, accessNotes: v.address.accessNotes || null }
        : null,
      bookedForSelf: v.bookedForSelf,
      requester: v.bookedForSelf ? null : { name: v.requester!.name, email: v.requester!.email || null, phone: v.requester!.phone || null, relationship: v.requester!.relationship || null, canPay: v.requester!.canPay, receiveUpdates: v.requester!.receiveUpdates },
      problemDescription: v.problemDescription || null,
      leadSource: v.leadSource || null,
      marketingOptIn: v.marketingOptIn,
      acceptedTerms: v.acceptedTerms,
      source: user?.role === "CUSTOMER" ? "PORTAL" : "ONLINE",
      existingCustomerId: user?.role === "CUSTOMER" ? user.customerId : null,
    });
    await audit({ actorUserId: user?.id ?? null, action: "booking.created", entityType: "Appointment", entityId: result.appointmentId, metadata: { source: "public", inServiceArea: result.inServiceArea }, ip });
    // Try to deliver confirmation emails right away; the worker will retry failures.
    await runDueJobs({ limit: 5 }).catch(() => undefined);
    return { ok: true, reference: result.reference, manageToken: result.manageToken, status: result.status, inServiceArea: result.inServiceArea };
  } catch (err) {
    if (err instanceof BookingError) return { ok: false, error: err.message, code: err.code };
    console.error("[booking] failed", (err as Error).message);
    return { ok: false, error: "Something went wrong while saving your request. Please try again or call us." };
  }
}
