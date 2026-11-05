/**
 * Shared content for the senior living community partnership program.
 * Used by the homepage, partnership page, service areas, FAQ, and the inquiry form.
 * Community partnership pricing is custom-quoted: do not add package prices here.
 */

export const REGION_LINE = "Serving East-Central and Northeast Ohio";

/** Community types we serve (also the options on the inquiry form). */
export const COMMUNITY_TYPES = [
  { value: "INDEPENDENT_LIVING", label: "Independent living community" },
  { value: "ASSISTED_LIVING", label: "Assisted living community" },
  { value: "RETIREMENT_COMMUNITY", label: "Retirement community" },
  { value: "CCRC", label: "Continuing care retirement community (CCRC)" },
  { value: "ACTIVE_ADULT_55", label: "Active adult or 55+ community" },
  { value: "OTHER_SENIOR_LIVING", label: "Other senior living community" },
] as const;

export const VISIT_FREQUENCIES = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "TWICE_MONTHLY", label: "Twice a month" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Every few months" },
  { value: "SINGLE_VISIT", label: "A single visit to start" },
  { value: "NOT_SURE", label: "Not sure yet" },
] as const;

export function communityTypeLabel(value: string | null | undefined): string | null {
  return COMMUNITY_TYPES.find((t) => t.value === value)?.label ?? null;
}

/** Maps the public form's community type to the CRM facility type (null = keep the default). */
export function facilityTypeForCommunity(value: string | null | undefined): "INDEPENDENT_LIVING" | "ASSISTED_LIVING" | "CONTINUING_CARE" | "OTHER" | null {
  switch (value) {
    case "INDEPENDENT_LIVING":
      return "INDEPENDENT_LIVING";
    case "ASSISTED_LIVING":
      return "ASSISTED_LIVING";
    case "CCRC":
      return "CONTINUING_CARE";
    case "RETIREMENT_COMMUNITY":
    case "ACTIVE_ADULT_55":
    case "OTHER_SENIOR_LIVING":
      return "OTHER";
    default:
      return null;
  }
}

export function visitFrequencyLabel(value: string | null | undefined): string | null {
  return VISIT_FREQUENCIES.find((f) => f.value === value)?.label ?? null;
}

/**
 * Community partnership territory: roughly 75 miles around Gnadenhutten, Ohio.
 * This is NOT the residential in-home service area, which is set in Admin > Services > Service areas.
 */
export const PARTNERSHIP_CENTER = { name: "Gnadenhutten, Ohio", lat: 40.3584, lng: -81.434 };
export const PARTNERSHIP_RADIUS_MILES = 75;

export const PARTNERSHIP_MARKETS = [
  "New Philadelphia and Dover",
  "Uhrichsville and Dennison",
  "Cambridge and Newcomerstown",
  "Canton, North Canton, and Massillon",
  "Akron and surrounding communities",
  "Zanesville",
  "Wooster",
  "Coshocton",
  "Carrollton",
] as const;

/** Individual city names for structured data (no street addresses or offices implied). */
export const PARTNERSHIP_CITIES = [
  "New Philadelphia",
  "Dover",
  "Uhrichsville",
  "Dennison",
  "Cambridge",
  "Newcomerstown",
  "Canton",
  "North Canton",
  "Massillon",
  "Akron",
  "Zanesville",
  "Wooster",
  "Coshocton",
  "Carrollton",
] as const;

export const COMMUNITY_FAQS: { question: string; answer: string }[] = [
  {
    question: "What types of communities does Kindred work with?",
    answer:
      "We work with independent living communities, assisted living communities, retirement communities, continuing care retirement communities (CCRCs), and active adult and 55+ communities throughout East-Central and Northeast Ohio, within about 75 miles of Gnadenhutten. If you are not sure whether your community is a fit, ask us.",
  },
  {
    question: "Does the community or the resident pay?",
    answer:
      "Either can work. Most partnerships are a recurring monthly program paid by the community so residents receive help as an amenity. Some communities prefer a program where residents pay for their own sessions, or a simple referral arrangement where residents book us directly. We prepare a custom proposal based on what you choose.",
  },
  {
    question: "How often can Kindred visit?",
    answer:
      "Communities choose a schedule that fits their residents, such as weekly, twice a month, or monthly. We agree on the days and session length in advance so residents and staff always know when we are coming.",
  },
  {
    question: "What technology issues can residents get help with?",
    answer:
      "Smartphones, tablets, computers, email, video calls with family, photos, smart TVs and streaming, e-readers, passwords and sign-ins, recognizing scams, and everyday technology questions. If we find something we cannot fix on site, such as a hardware failure, we explain the options plainly.",
  },
  {
    question: "Can residents book appointments in advance?",
    answer:
      "Yes. Kindred coordinates resident appointments ahead of each visit through a sign-up page, a printed sign-up sheet, or your front desk. Walk-ins are welcome when the schedule allows.",
  },
  {
    question: "Can families arrange additional support?",
    answer:
      "Yes. Family members can schedule and pay for additional help, including in-home or remote appointments. A resident decides what, if anything, is shared with family members.",
  },
  {
    question: "Does Kindred need access to community systems?",
    answer:
      "No. We work with residents on their own devices and accounts. We only ask for access to guest Wi-Fi and a quiet place to meet. We do not need access to your community's internal networks, records, or software.",
  },
  {
    question: "How are residents' privacy and personal information protected?",
    answer:
      "Each resident meets with us one-on-one, and what they show us on their device stays between them and us. Community management receives a summary of program usage, such as the number of sessions held, without unnecessary personal information about individual residents. We never ask for banking passwords and never make changes without the resident's permission.",
  },
  {
    question: "Can we start with a single paid visit?",
    answer:
      "Yes. Many communities begin with one scheduled support session so residents and staff can see how it works before choosing a recurring schedule.",
  },
  {
    question: "How do we request a proposal?",
    answer:
      "Complete the partnership proposal request form on our Senior Living page, or contact us directly. We will learn about your residents, your preferred schedule, and how you would like the program paid for, then send a custom proposal. There is no obligation.",
  },
];
