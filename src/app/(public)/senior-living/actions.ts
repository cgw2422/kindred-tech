"use server";

import { clientIp } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { queueTemplatedEmail } from "@/lib/email/send";
import { type ActionState, failure, formObject, success, zodFieldErrors } from "@/lib/forms";
import { rateLimit } from "@/lib/rate-limit";
import { echoValues } from "../_lib/format";
import { FACILITY_INTERESTS, facilityInquirySchema } from "./schema";

const FIELDS = ["facilityName", "contactName", "contactTitle", "email", "phone", "city", "residentCount", "interest", "message"] as const;

const SUCCESS_MESSAGE = "Thank you. We received your inquiry and will contact you within two business days.";

export async function submitFacilityInquiry(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formObject(formData);

  // Honeypot: real visitors never see or fill this field. Pretend success for bots.
  if (raw.website) return success(SUCCESS_MESSAGE);

  const values = echoValues(raw, FIELDS);
  const fail = (error: string, fieldErrors?: Record<string, string>): ActionState => ({ ...failure(error, fieldErrors), data: { values } });

  const parsed = facilityInquirySchema.safeParse(values);
  if (!parsed.success) return fail("Please correct the highlighted fields.", zodFieldErrors(parsed.error));

  const ip = (await clientIp()) ?? "unknown";
  if (!(await rateLimit(`facility-inquiry:${ip}`, 5, 3600))) {
    return fail("We have received several inquiries from your connection recently. Please try again later or contact us directly.");
  }

  const d = parsed.data;
  try {
    const inquiry = await prisma.facilityInquiry.create({
      data: {
        facilityName: d.facilityName,
        contactName: d.contactName,
        contactTitle: d.contactTitle || null,
        email: d.email,
        phone: d.phone || null,
        city: d.city || null,
        residentCount: d.residentCount ? Number(d.residentCount) : null,
        interest: FACILITY_INTERESTS.find((i) => i.value === d.interest)?.label ?? null,
        message: d.message || null,
      },
    });
    await queueTemplatedEmail({
      templateKey: "facility_inquiry_received",
      to: d.email,
      vars: { contactName: d.contactName, facilityName: d.facilityName },
      idempotencyKey: `facility-inquiry:${inquiry.id}`,
      relatedType: "FacilityInquiry",
      relatedId: inquiry.id,
    });
  } catch (err) {
    console.error("[senior-living] failed to save facility inquiry", (err as Error).message);
    return fail("Sorry, something went wrong while sending your inquiry. Please try again in a few minutes.");
  }
  return success(SUCCESS_MESSAGE);
}
