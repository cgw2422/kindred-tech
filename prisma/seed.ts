/**
 * Seed script.
 *
 *  - Reference data (service catalog, membership plan, service area, email
 *    templates, default settings) is safe to seed in any environment and is
 *    upserted (re-running does not duplicate or overwrite edits to prices).
 *  - SAMPLE data (sample customers, sample facility, demo logins) is created
 *    ONLY when NODE_ENV !== "production" and SEED_SAMPLE_DATA !== "false".
 *    Sample records are clearly labeled "(Sample)" and use example.com emails.
 *
 * The owner account is created from SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { DEFAULT_TEMPLATES } from "../src/lib/email/defaults";
import { settingsDefaults } from "../src/lib/settings";
import { markdownToHtml } from "../src/lib/articles/html";
import { ARTICLES_PART1 } from "./seed-data/articles/part1";
import { ARTICLES_PART2 } from "./seed-data/articles/part2";
import { ARTICLES_PART3 } from "./seed-data/articles/part3";
import { ARTICLES_PART4 } from "./seed-data/articles/part4";

const prisma = new PrismaClient();

const TUSCARAWAS_ZIPS = [
  "43804", "43832", "43837", "43840", "44612", "44621", "44622", "44624", "44629", "44653",
  "44656", "44663", "44671", "44678", "44680", "44681", "44682", "44683", "44697",
];
const TUSCARAWAS_COMMUNITIES = [
  "New Philadelphia", "Dover", "Uhrichsville", "Dennison", "Strasburg", "Sugarcreek", "Bolivar",
  "Gnadenhutten", "Newcomerstown", "Port Washington", "Zoar", "Mineral City", "Baltic", "Ragersville",
  "Tuscarawas", "Midvale", "Stone Creek", "Sandyville", "Dundee",
];

type ServiceSeed = {
  slug: string;
  name: string;
  category: string;
  shortDescription: string;
  description: string;
  pricingType: "FIXED" | "STARTING_AT" | "CUSTOM_QUOTE";
  basePriceCents: number;
  durationMinutes: number;
  extensionMinutes?: number;
  extensionPriceCents?: number;
  isRemote?: boolean;
  isBookableOnline?: boolean;
  requiresApproval?: boolean;
  memberDiscountEligible?: boolean;
  sortOrder: number;
};

const CATEGORIES = [
  { slug: "in-home", name: "In-Home Support", sortOrder: 1 },
  { slug: "lessons", name: "Lessons", sortOrder: 2 },
  { slug: "remote", name: "Remote Support", sortOrder: 3 },
  { slug: "reviews", name: "Reviews & Checkups", sortOrder: 4 },
  { slug: "setup", name: "Setup", sortOrder: 5 },
  { slug: "communities", name: "Senior Living Communities", sortOrder: 6 },
];

const SERVICES: ServiceSeed[] = [
  {
    slug: "standard-in-home-support",
    name: "Standard In-Home Support",
    category: "in-home",
    shortDescription: "Up to 60 minutes of patient, one-on-one help in your home.",
    description:
      "Bring us your technology questions and frustrations. We help with computers, phones, tablets, printers, email, Wi-Fi, TVs, and more, at a comfortable pace in your own home. Additional time is available in 30-minute increments.",
    pricingType: "FIXED",
    basePriceCents: 9900,
    durationMinutes: 60,
    extensionMinutes: 30,
    extensionPriceCents: 4000,
    sortOrder: 1,
  },
  {
    slug: "smartphone-tablet-lesson",
    name: "Smartphone or Tablet Lesson",
    category: "lessons",
    shortDescription: "A personal lesson on your own phone or tablet.",
    description:
      "Learn the things you actually want to do: calls, texts, photos, video chats with family, email, and apps. We go at your pace and can leave written notes behind.",
    pricingType: "FIXED",
    basePriceCents: 7900,
    durationMinutes: 60,
    extensionMinutes: 30,
    extensionPriceCents: 4000,
    sortOrder: 2,
  },
  {
    slug: "remote-support",
    name: "Remote Support",
    category: "remote",
    shortDescription: "Up to 30 minutes of help by phone or secure screen sharing.",
    description:
      "Quick help without a home visit. We call you at your appointment time and, only with your permission, may use secure screen sharing to see what you see.",
    pricingType: "FIXED",
    basePriceCents: 4900,
    durationMinutes: 30,
    extensionMinutes: 30,
    extensionPriceCents: 4000,
    isRemote: true,
    sortOrder: 3,
  },
  {
    slug: "subscription-review-savings",
    name: "Subscription Review & Savings",
    category: "reviews",
    shortDescription: "We help you review subscriptions and recurring tech bills.",
    description:
      "Together we look through streaming services, antivirus, apps, cloud storage, internet, cable, and phone plans so you can decide what to keep. Any changes are made only with your permission. Savings are not guaranteed.",
    pricingType: "FIXED",
    basePriceCents: 7900,
    durationMinutes: 60,
    sortOrder: 4,
  },
  {
    slug: "new-computer-setup",
    name: "New Computer Setup",
    category: "setup",
    shortDescription: "Set up a new computer and move what matters from your old one.",
    description:
      "We unpack and set up your new computer, sign in to accounts you choose, move photos and documents, set up a printer, and show you how everything works. Final price depends on what needs to be transferred and is confirmed with you first.",
    pricingType: "STARTING_AT",
    basePriceCents: 14900,
    durationMinutes: 120,
    sortOrder: 5,
  },
  {
    slug: "technology-checkup",
    name: "Kindred Technology Checkup",
    category: "reviews",
    shortDescription: "Up to 90 minutes reviewing the health, safety, and setup of your devices.",
    description:
      "A thorough look at your computer, phone, tablet, and home network: updates, backups, security settings, passwords, and anything that is slow or confusing. You receive a plain-language summary.",
    pricingType: "FIXED",
    basePriceCents: 14900,
    durationMinutes: 90,
    sortOrder: 6,
  },
  {
    slug: "senior-living-tech-help-day",
    name: "Senior Living Tech Help Day",
    category: "communities",
    shortDescription: "On-site technology help sessions for residents of a senior living community.",
    description:
      "We set up in your community and meet with residents one at a time. Available as resident-paid, facility-sponsored, or recurring contract options.",
    pricingType: "CUSTOM_QUOTE",
    basePriceCents: 0,
    durationMinutes: 180,
    isBookableOnline: false,
    memberDiscountEligible: false,
    sortOrder: 7,
  },
  {
    slug: "tech-help-day-resident-session",
    name: "Tech Help Day Resident Session",
    category: "communities",
    shortDescription: "A one-on-one session during a scheduled Tech Help Day at your community.",
    description: "A personal session with our technician during a Tech Help Day hosted by your community.",
    pricingType: "FIXED",
    basePriceCents: 4900,
    durationMinutes: 30,
    isBookableOnline: false,
    sortOrder: 8,
  },
];

async function seedReferenceData() {
  for (const [key, value] of Object.entries(settingsDefaults)) {
    await prisma.setting.upsert({ where: { key }, create: { key, value: value as object }, update: {} });
  }

  const catIds: Record<string, string> = {};
  for (const c of CATEGORIES) {
    const row = await prisma.serviceCategory.upsert({ where: { slug: c.slug }, create: c, update: { name: c.name, sortOrder: c.sortOrder } });
    catIds[c.slug] = row.id;
  }
  for (const s of SERVICES) {
    const { category, ...rest } = s;
    await prisma.service.upsert({
      where: { slug: s.slug },
      create: { ...rest, categoryId: catIds[category], isBookableOnline: s.isBookableOnline ?? true, requiresApproval: s.requiresApproval ?? true },
      update: {}, // never overwrite admin edits
    });
  }

  const standard = await prisma.service.findUniqueOrThrow({ where: { slug: "standard-in-home-support" } });
  if ((await prisma.serviceAddon.count()) === 0) {
    await prisma.serviceAddon.createMany({
      data: [
        { serviceId: standard.id, name: "Printer or scanner setup", priceCents: 2500, durationMinutes: 15 },
        { serviceId: standard.id, name: "Written step-by-step notes to keep", priceCents: 1500, durationMinutes: 10 },
      ],
    });
  }

  await prisma.membershipPlan.upsert({
    where: { slug: "kindred-care" },
    create: {
      slug: "kindred-care",
      name: "Kindred Care Membership",
      description: "Peace of mind for your household: priority scheduling, a monthly remote support allowance, an annual technology review, and member pricing on in-home visits.",
      priceCents: 4900,
      interval: "MONTH",
      priorityScheduling: true,
      remoteMinutesPerPeriod: 30,
      annualReviewIncluded: true,
      inHomeDiscountPercent: 10,
      benefitsText: [
        "Priority scheduling for in-home visits",
        "Up to 30 minutes of remote support each month",
        "One Kindred Technology Checkup each membership year",
        "10% off in-home appointments",
      ],
    },
    update: {},
  });

  if ((await prisma.serviceArea.count()) === 0) {
    await prisma.serviceArea.create({
      data: {
        name: "Tuscarawas County",
        county: "Tuscarawas",
        state: "OH",
        postalCodes: TUSCARAWAS_ZIPS,
        communities: TUSCARAWAS_COMMUNITIES,
        travelFeeCents: 0,
        notes: "Initial service area. Verify ZIP codes before launch; some ZIPs cross county lines.",
      },
    });
  }

  for (const t of DEFAULT_TEMPLATES) {
    await prisma.emailTemplate.upsert({
      where: { key: t.key },
      create: { key: t.key, name: t.name, description: t.description, category: t.category, subject: t.subject, body: t.body },
      update: {},
    });
  }
}

const ARTICLE_CATEGORIES = [
  { slug: "smartphones-tablets", name: "Smartphones & Tablets", description: "Getting comfortable with your iPhone, Android phone, or tablet." },
  { slug: "computers-laptops", name: "Computers & Laptops", description: "Everyday help with Windows computers, Macs, and laptops." },
  { slug: "internet-wifi", name: "Internet & Wi-Fi", description: "Getting online and staying connected at home." },
  { slug: "online-safety", name: "Online Safety & Scam Prevention", description: "How to recognize scams and protect yourself online and on the phone." },
  { slug: "smart-tv-streaming", name: "Smart TVs & Streaming", description: "Setting up smart TVs and streaming services." },
  { slug: "staying-connected", name: "Staying Connected With Family", description: "Video calls, photos, and messages with the people you care about." },
  { slug: "passwords-accounts", name: "Passwords & Accounts", description: "Keeping your accounts secure without the frustration." },
  { slug: "buying-guides", name: "Technology Buying Guides", description: "What to look for before you buy a new device." },
  { slug: "general-tips", name: "General Technology Tips", description: "Everyday tips for the technology in your life." },
];

/**
 * Tech Tips: categories and the initial articles. Idempotent and non-destructive:
 * existing categories and articles (matched by slug / seedKey) are never overwritten,
 * so edits made in the admin dashboard are preserved. New articles are DRAFTS.
 */
async function seedTechTips() {
  const catIds: Record<string, string> = {};
  for (const [i, c] of ARTICLE_CATEGORIES.entries()) {
    const row = await prisma.articleCategory.upsert({ where: { slug: c.slug }, create: { ...c, sortOrder: i + 1 }, update: {} });
    catIds[c.slug] = row.id;
  }
  let created = 0;
  for (const a of [...ARTICLES_PART1, ...ARTICLES_PART2, ...ARTICLES_PART3, ...ARTICLES_PART4]) {
    const exists = await prisma.article.findUnique({ where: { seedKey: a.seedKey }, select: { id: true } });
    if (exists) continue;
    const slugTaken = await prisma.article.findUnique({ where: { slug: a.slug }, select: { id: true } });
    if (slugTaken) continue; // an article with this URL already exists; leave it alone
    await prisma.article.create({
      data: {
        seedKey: a.seedKey,
        slug: a.slug,
        title: a.title,
        excerpt: a.excerpt,
        content: markdownToHtml(a.body),
        categoryId: catIds[a.category] ?? null,
        seoTitle: a.seoTitle,
        metaDescription: a.metaDescription,
        status: "DRAFT",
      },
    });
    created++;
  }
  console.log(`Tech Tips: ${created} new draft article(s) added.`);
}

async function seedOwner() {
  const email = (process.env.SEED_OWNER_EMAIL ?? "owner@example.com").toLowerCase();
  const password = process.env.SEED_OWNER_PASSWORD ?? (process.env.NODE_ENV === "production" ? undefined : "KindredDev!2026");
  if (!password) {
    console.warn("SEED_OWNER_PASSWORD not set; skipping owner account creation in production.");
    return null;
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const owner = await prisma.user.create({
    data: { email, name: process.env.SEED_OWNER_NAME ?? "Owner", role: "OWNER", passwordHash: await hashPassword(password), emailVerifiedAt: new Date() },
  });
  // The owner-operator is also the first technician.
  const tech = await prisma.technician.create({ data: { userId: owner.id, displayName: process.env.SEED_OWNER_NAME ?? "Owner", color: "#10375B" } });
  await prisma.technicianSchedule.createMany({
    data: [1, 2, 3, 4, 5].map((d) => ({ technicianId: tech.id, dayOfWeek: d, startMinute: 9 * 60, endMinute: 17 * 60 })).concat([{ technicianId: tech.id, dayOfWeek: 6, startMinute: 10 * 60, endMinute: 14 * 60 }]),
  });
  console.log(`Owner account: ${email}${process.env.SEED_OWNER_PASSWORD ? "" : " (development password: KindredDev!2026)"}`);
  return owner;
}

async function seedSampleData() {
  if (await prisma.customer.findFirst({ where: { lastName: "(Sample)" } })) return;
  const pw = await hashPassword("KindredDev!2026");

  // Second technician (sample)
  const techUser = await prisma.user.create({ data: { email: "tech@example.com", name: "Sample Technician", role: "TECHNICIAN", passwordHash: pw } });
  const tech = await prisma.technician.create({ data: { userId: techUser.id, displayName: "Sample Technician", color: "#477C32" } });
  await prisma.technicianSchedule.createMany({ data: [2, 3, 4].map((d) => ({ technicianId: tech.id, dayOfWeek: d, startMinute: 10 * 60, endMinute: 16 * 60 })) });

  await prisma.user.create({ data: { email: "dispatcher@example.com", name: "Sample Dispatcher", role: "DISPATCHER", passwordHash: pw } });

  const c1 = await prisma.customer.create({
    data: {
      firstName: "Margaret",
      lastName: "(Sample)",
      email: "margaret.sample@example.com",
      phone: "330-555-0101",
      contactPreference: "PHONE",
      leadSource: "Sample data",
      addresses: { create: { line1: "100 Sample Street", city: "New Philadelphia", state: "OH", postalCode: "44663", county: "Tuscarawas", isPrimary: true, lat: 40.4898, lng: -81.4457 } },
      devices: { create: [{ type: "Tablet", make: "Apple", model: "iPad", nickname: "Kitchen iPad" }, { type: "Laptop", make: "Dell", os: "Windows 11" }] },
      familyContacts: {
        create: { name: "Daniel (Sample)", relationship: "Son", email: "daniel.sample@example.com", canSchedule: true, canPay: true, isBillingContact: true, canReceiveUpdates: true, canViewServiceDetails: false },
      },
    },
  });
  await prisma.user.create({ data: { email: "margaret.sample@example.com", name: "Margaret (Sample)", role: "CUSTOMER", passwordHash: pw, customerId: c1.id } });

  await prisma.customer.create({
    data: {
      firstName: "Robert",
      lastName: "(Sample)",
      email: "robert.sample@example.com",
      phone: "330-555-0102",
      leadSource: "Sample data",
      addresses: { create: { line1: "200 Example Avenue", city: "Dover", state: "OH", postalCode: "44622", county: "Tuscarawas", isPrimary: true, lat: 40.5206, lng: -81.4740 } },
    },
  });

  const facility = await prisma.facility.create({
    data: {
      name: "Sample Senior Living Community",
      type: "INDEPENDENT_LIVING",
      line1: "300 Example Way",
      city: "Dover",
      state: "OH",
      postalCode: "44622",
      county: "Tuscarawas",
      partnershipStatus: "ACTIVE",
      partnershipModel: "RESIDENT_PAID_DAY",
      residentRateCents: 4500,
      internalNotes: "Sample facility for development only.",
      contacts: { create: [{ name: "Pat (Sample)", title: "Activities Director", role: "ACTIVITIES_DIRECTOR", email: "activities.sample@example.com", portalAccess: true }] },
      agreements: { create: { model: "RESIDENT_PAID_DAY", status: "ACTIVE", startDate: new Date(), residentRateCents: 4500, terms: "Sample agreement terms for development." } },
    },
    include: { contacts: true },
  });
  const facUser = await prisma.user.create({ data: { email: "activities.sample@example.com", name: "Pat (Sample)", role: "FACILITY_CONTACT", passwordHash: pw } });
  await prisma.facilityContact.update({ where: { id: facility.contacts[0].id }, data: { userId: facUser.id } });

  console.log("Sample data created. Demo logins (password KindredDev!2026): tech@example.com, dispatcher@example.com, margaret.sample@example.com, activities.sample@example.com");
}

async function main() {
  await seedReferenceData();
  await seedTechTips();
  await seedOwner();
  const allowSample = process.env.NODE_ENV !== "production" && process.env.SEED_SAMPLE_DATA !== "false";
  if (allowSample) await seedSampleData();
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
