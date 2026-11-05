import { z } from "zod";
import { zOptionalEmail, zPhone } from "@/lib/forms";

export const CONTACT_TOPICS = [
  { value: "general", label: "General question" },
  { value: "service", label: "Help with a device or service" },
  { value: "family", label: "Arranging help for a family member" },
  { value: "membership", label: "Kindred Care membership" },
  { value: "service-area", label: "Do you serve my area?" },
  { value: "billing", label: "Billing or an invoice" },
  { value: "community", label: "Senior living community" },
  { value: "other", label: "Something else" },
] as const;

export const contactSchema = z
  .object({
    name: z.string().trim().min(2, "Please enter your name.").max(120),
    email: zOptionalEmail,
    phone: zPhone,
    topic: z.string().refine((v) => v === "" || CONTACT_TOPICS.some((t) => t.value === v), "Please choose a topic from the list."),
    message: z.string().trim().min(5, "Please tell us a little about how we can help.").max(4000, "Please keep your message under 4,000 characters."),
  })
  .superRefine((v, ctx) => {
    if (!v.email && !v.phone) {
      ctx.addIssue({ code: "custom", path: ["email"], message: "Please give us an email address or a phone number so we can reply." });
    }
  });
