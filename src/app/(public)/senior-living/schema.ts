import { z } from "zod";
import { zOptionalEmail, zPhone } from "@/lib/forms";

export const FACILITY_INTERESTS = [
  { value: "RESIDENT_REFERRAL", label: "Resident Referral Partner" },
  { value: "RESIDENT_PAID_DAY", label: "Resident-Paid Tech Help Day" },
  { value: "FACILITY_SPONSORED_DAY", label: "Facility-Sponsored Tech Help Day" },
  { value: "RECURRING_CONTRACT", label: "Recurring Facility Contract" },
  { value: "NOT_SURE", label: "Not sure yet" },
] as const;

export const facilityInquirySchema = z.object({
  facilityName: z.string().trim().min(2, "Please enter the name of your community.").max(200),
  contactName: z.string().trim().min(2, "Please enter your name.").max(120),
  contactTitle: z.string().trim().max(120),
  email: zOptionalEmail.refine((v) => v !== "", "Please enter your email address."),
  phone: zPhone,
  city: z.string().trim().max(120),
  residentCount: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d{1,5}$/.test(v) && Number(v) > 0), "Please enter an approximate number, such as 80."),
  interest: z.string().refine((v) => v === "" || FACILITY_INTERESTS.some((i) => i.value === v), "Please choose an option from the list."),
  message: z.string().trim().max(4000, "Please keep your message under 4,000 characters."),
});

export type FacilityInquiryInput = z.infer<typeof facilityInquirySchema>;
