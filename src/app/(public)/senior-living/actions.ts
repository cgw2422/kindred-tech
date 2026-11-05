"use server";

import { clientIp } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { queueTemplatedEmail } from "@/lib/email/send";
import { type ActionState, failure, formObject, success, zodFieldErrors } from "@/lib/forms";
import { rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { communityTypeLabel, visitFrequencyLabel } from "@/lib/community";
import { echoValues } from "../_lib/format";
import { FACILITY_INTERESTS, facilityInquirySchema } from "./schema";

const FIELDS = ["facilityName", "city", "state", "contactName", "contactTitle", "email", "phone", "communityType", "residentCount", "visitFrequency", "interest", "message"] as const;

// Deliberately does not claim an email was sent: delivery depends on the email provider.
const SUCCESS_MESSAGE =
  "We received your partnership proposal request and saved your details. We will contact you within two business days to learn about your residents and discuss a proposal.";

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
    return fail("We have received several requests from your connection recently. Please try again later or contact us directly.");
  }

  const d = parsed.data;
  let inquiryId: string;
  try {
    const inquiry = await prisma.facilityInquiry.create({
      data: {
        facilityName: d.facilityName,
        contactName: d.contactName,
        contactTitle: d.contactTitle || null,
        email: d.email,
        phone: d.phone || null,
        city: d.city,
        state: d.state,
        communityType: d.communityType,
        visitFrequency: d.visitFrequency || null,
        residentCount: d.residentCount ? Number(d.residentCount) : null,
        interest: FACILITY_INTERESTS.find((i) => i.value === d.interest)?.label ?? null,
        message: d.message || null,
      },
    });
    inquiryId = inquiry.id;
  } catch (err) {
    console.error("[senior-living] failed to save facility inquiry", (err as Error).message);
    return fail("Sorry, something went wrong while sending your request. Please try again in a few minutes or contact us directly.");
  }

  // Notifications are queued after the inquiry is safely saved; a queueing problem must not lose the lead.
  try {
    await queueTemplatedEmail({
      templateKey: "facility_inquiry_received",
      to: d.email,
      vars: { contactName: d.contactName, facilityName: d.facilityName },
      idempotencyKey: `facility-inquiry:${inquiryId}`,
      relatedType: "FacilityInquiry",
      relatedId: inquiryId,
    });
    const notifications = await getSettings("notifications");
    if (notifications.adminNotificationEmail) {
      await queueTemplatedEmail({
        templateKey: "admin_new_lead",
        to: notifications.adminNotificationEmail,
        vars: {
          leadType: "community partnership inquiry",
          leadName: `${d.facilityName} (${d.contactName})`,
          leadSummary: [
            communityTypeLabel(d.communityType),
            `${d.city}, ${d.state}`,
            d.residentCount ? `about ${d.residentCount} residents` : null,
            visitFrequencyLabel(d.visitFrequency) ? `preferred visits: ${visitFrequencyLabel(d.visitFrequency)!.toLowerCase()}` : null,
          ]
            .filter(Boolean)
            .join(", "),
          adminUrl: `${env.appUrl}/admin/facilities?tab=inquiries`,
        },
        idempotencyKey: `admin-lead:facility-inquiry:${inquiryId}`,
        relatedType: "FacilityInquiry",
        relatedId: inquiryId,
      });
    }
  } catch (err) {
    console.error("[senior-living] inquiry saved but notification could not be queued", (err as Error).message);
  }
  return success(SUCCESS_MESSAGE);
}
