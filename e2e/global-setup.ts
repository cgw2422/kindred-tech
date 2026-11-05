import { PrismaClient } from "@prisma/client";

/** Clears rate-limit counters so repeated local e2e runs are not throttled. Never touches other data. */
export default async function globalSetup() {
  if (process.env.E2E_BASE_URL && !process.env.E2E_ALLOW_DB_RESET) return;
  const prisma = new PrismaClient();
  try {
    await prisma.rateLimitHit.deleteMany({});
  } finally {
    await prisma.$disconnect();
  }
}
