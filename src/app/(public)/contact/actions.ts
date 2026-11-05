"use server";

import { clientIp } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { type ActionState, failure, formObject, success, zodFieldErrors } from "@/lib/forms";
import { rateLimit } from "@/lib/rate-limit";
import { echoValues } from "../_lib/format";
import { CONTACT_TOPICS, contactSchema } from "./schema";

const FIELDS = ["name", "email", "phone", "topic", "message"] as const;
const SUCCESS_MESSAGE = "Thank you. Your message has been sent and we will get back to you as soon as we can.";

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
  try {
    await prisma.contactMessage.create({
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
  return success(SUCCESS_MESSAGE);
}
