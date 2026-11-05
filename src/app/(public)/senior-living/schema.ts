import { z } from "zod";
import { zOptionalEmail, zPhone } from "@/lib/forms";
import { COMMUNITY_TYPES, VISIT_FREQUENCIES } from "@/lib/community";

export const FACILITY_INTERESTS = [
  { value: "RECURRING_CONTRACT", label: "Recurring monthly resident support program" },
  { value: "FACILITY_SPONSORED_DAY", label: "Community-sponsored support session" },
  { value: "RESIDENT_PAID_DAY", label: "Resident-paid support session" },
  { value: "RESIDENT_REFERRAL", label: "Resident referral partnership" },
  { value: "NOT_SURE", label: "Not sure yet" },
] as const;

const oneOf = (list: readonly { value: string }[], message: string) => z.string().refine((v) => v === "" || list.some((i) => i.value === v), message);

export const facilityInquirySchema = z.object({
  facilityName: z.string().trim().min(2, "Please enter the name of your community.").max(200),
  city: z.string().trim().min(2, "Please enter the city.").max(120),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Please enter the two-letter state, such as OH."),
  contactName: z.string().trim().min(2, "Please enter your name.").max(120),
  contactTitle: z.string().trim().max(120),
  email: zOptionalEmail.refine((v) => v !== "", "Please enter your email address."),
  phone: zPhone,
  communityType: oneOf(COMMUNITY_TYPES, "Please choose a community type from the list.").refine((v) => v !== "", "Please choose your community type."),
  residentCount: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d{1,5}$/.test(v) && Number(v) > 0), "Please enter an approximate number, such as 80."),
  visitFrequency: oneOf(VISIT_FREQUENCIES, "Please choose a frequency from the list."),
  interest: oneOf(FACILITY_INTERESTS, "Please choose an option from the list."),
  message: z.string().trim().max(4000, "Please keep your message under 4,000 characters."),
});

export type FacilityInquiryInput = z.infer<typeof facilityInquirySchema>;
