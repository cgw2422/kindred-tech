"use server";

import { clientIp } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { type ActionState, failure, formObject, success, zodFieldErrors } from "@/lib/forms";
import { rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { env } from "@/lib/env";
import { queueTemplatedEmail } from "@/lib/email/send";
import { echoValues } from "../_lib/format";
import { CONTACT_TOPICS, contactSchema } from "./schema";

const FIELDS = ["name", "email", "phone", "topic", "message"] as const;
// Deliberately does not claim an email was sent: the message is saved for our team.
const SUCCESS_MESSAGE = "Thank you. We received your message and will get back to you as soon as we can.";

export async function submitContactMessage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formObject(formData);
  if (raw.website) return success(SUCCESS_MESSAGE); // honeypot

  const values = echoValues(raw, FIELDS);
  const fail = (error: string, fieldErrors?: Record<string, string>): ActionState => ({ ...failure(error, fieldErrors), data: { values } });

  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) return fail("Please correct the highlighted fields.", zodFieldErrors(parsed.error));

  const ip = (await clientIp()) ?? "unknown";
  if (!(await rateLimit(`contact:${ip}`, 5, 3600))) {
    return fail("We have received several messages from your connection recently. Please try again later.");
  }

  const d = parsed.data;
  let saved: { id: string };
  try {
    saved = await prisma.contactMessage.create({
      data: {
        name: d.name,
        email: d.email || null,
        phone: d.phone || null,
        topic: CONTACT_TOPICS.find((t) => t.value === d.topic)?.label ?? null,
        message: d.message,
      },
    });
  } catch (err) {
    console.error("[contact] failed to save message", (err as Error).message);
    return fail("Sorry, something went wrong while sending your message. Please try again in a few minutes.");
  }
  try {
    const notifications = await getSettings("notifications");
    if (notifications.adminNotificationEmail) {
      const isCommunity = d.topic === "community";
      await queueTemplatedEmail({
        templateKey: "admin_new_lead",
        to: notifications.adminNotificationEmail,
        vars: {
          leadType: isCommunity ? "community contact message" : "contact message",
          leadName: d.name,
          leadSummary: `${CONTACT_TOPICS.find((t) => t.value === d.topic)?.label ?? "General"}: ${d.message.slice(0, 200)}`,
          adminUrl: `${env.appUrl}/admin/leads`,
        },
        idempotencyKey: `admin-lead:contact:${saved.id}`,
        relatedType: "ContactMessage",
        relatedId: saved.id,
      });
    }
  } catch (err) {
    console.error("[contact] message saved but notification could not be queued", (err as Error).message);
  }
  return success(SUCCESS_MESSAGE);
}
