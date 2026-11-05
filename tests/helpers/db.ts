import { prisma } from "@/lib/db";
import { DEFAULT_TEMPLATES } from "@/lib/email/defaults";
import { settingsDefaults } from "@/lib/settings";
import { hashPassword } from "@/lib/auth/password";

/** Truncates every application table. Only ever runs against the test database. */
export async function resetDb() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/_test/.test(url)) throw new Error(`Refusing to reset non-test database: ${url}`);
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

/** Minimal reference data: settings, templates, a standard service, a service area. */
export async function seedBasics() {
  for (const [key, value] of Object.entries(settingsDefaults)) {
    await prisma.setting.create({ data: { key, value: value as object } });
  }
  for (const t of DEFAULT_TEMPLATES) {
    await prisma.emailTemplate.create({ data: { key: t.key, name: t.name, category: t.category, subject: t.subject, body: t.body } });
  }
  const service = await prisma.service.create({
    data: {
      slug: "standard",
      name: "Standard In-Home Support",
      shortDescription: "x",
      description: "x",
      basePriceCents: 9900,
      durationMinutes: 60,
      extensionMinutes: 30,
      extensionPriceCents: 4000,
      requiresApproval: true,
    },
  });
  const remote = await prisma.service.create({
    data: { slug: "remote", name: "Remote Support", shortDescription: "x", description: "x", basePriceCents: 4900, durationMinutes: 30, isRemote: true },
  });
  const area = await prisma.serviceArea.create({ data: { name: "Tuscarawas County", county: "Tuscarawas", postalCodes: ["44663", "44622"], communities: ["New Philadelphia", "Dover"] } });
  return { service, remote, area };
}

let userCounter = 0;
export async function createUser(role: "OWNER" | "ADMIN" | "DISPATCHER" | "TECHNICIAN" | "CUSTOMER" | "FACILITY_CONTACT", extra: { customerId?: string } = {}) {
  userCounter++;
  return prisma.user.create({
    data: { email: `${role.toLowerCase()}${userCounter}-${Date.now()}@example.com`, name: `${role} ${userCounter}`, role, passwordHash: await hashPassword("test-password-123"), ...extra },
  });
}

/** Technician working Mon-Sat 9:00-17:00 local time. */
export async function createTechnician(name = "Tech") {
  const user = await createUser("TECHNICIAN");
  return prisma.technician.create({
    data: {
      userId: user.id,
      displayName: name,
      schedules: { create: [1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, startMinute: 540, endMinute: 1020 })) },
    },
  });
}

export async function createCustomer(overrides: Partial<{ firstName: string; lastName: string; email: string }> = {}) {
  return prisma.customer.create({
    data: {
      firstName: overrides.firstName ?? "Test",
      lastName: overrides.lastName ?? "Customer",
      email: overrides.email ?? `cust-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
      addresses: { create: { line1: "1 Main St", city: "Dover", state: "OH", postalCode: "44622", isPrimary: true } },
    },
    include: { addresses: true },
  });
}
