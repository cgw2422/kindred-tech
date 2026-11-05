import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createBooking, changeAppointmentStatus } from "@/lib/booking/service";
import { createInvoice, issueInvoice, recordManualPayment } from "@/lib/billing/invoices";
import { makeRange, REPORTS, toCsv } from "@/lib/reports";
import { localMinuteToUtc } from "@/lib/time";
import { createTechnician, createUser, resetDb, seedBasics } from "../helpers/db";

const DAY = "2026-11-16";
let serviceId: string;
beforeEach(async () => {
  await resetDb();
  serviceId = (await seedBasics()).service.id;
});

describe("reports", () => {
  it("every report runs on real data and revenue counts only verified payments", async () => {
    await createTechnician();
    const owner = await createUser("OWNER");
    const b = await createBooking({
      serviceId,
      startsAt: localMinuteToUtc(DAY, 600),
      customer: { firstName: "Rita", lastName: "Report", email: "rita@example.com" },
      address: { line1: "1 Main", city: "Dover", state: "OH", postalCode: "44622" },
      bookedForSelf: true,
      acceptedTerms: true,
      leadSource: "Friend or family",
      now: new Date("2026-11-10T12:00:00Z"),
    });
    await changeAppointmentStatus({ appointmentId: b.appointmentId, to: "CANCELED", actor: { id: null, role: "ADMIN" }, cancelReason: "Feeling unwell" });
    const inv = await createInvoice({ customerId: b.customerId, appointmentId: b.appointmentId, lines: [{ description: "Visit", unitPriceCents: 9900, serviceId }] });
    await issueInvoice(inv.id, { sendEmail: false });
    await recordManualPayment({ invoiceId: inv.id, amountCents: 5000, method: "CHECK", recordedById: owner.id });
    // an unverified pending Stripe payment must not count
    await prisma.payment.create({ data: { invoiceId: inv.id, amountCents: 4900, status: "PENDING", method: "STRIPE" } });

    const range = makeRange("2026-01-01", "2026-12-31", "America/New_York");
    const rev = await REPORTS.revenue(range);
    expect(rev.summary?.[0][1]).toBe("$50");
    const canc = await REPORTS.cancellations(range);
    expect(canc.rows[0]).toEqual(["Feeling unwell", 1]);
    const leads = await REPORTS["lead-sources"](range);
    expect(leads.rows.find((r) => r[0] === "Friend or family")?.[2]).toBe(1);
    const out = await REPORTS.outstanding(range);
    expect(out.rows[0][3]).toBe("49.00");
    for (const fn of Object.values(REPORTS)) {
      const t = await fn(range);
      expect(Array.isArray(t.rows)).toBe(true);
      expect(toCsv(t).split("\r\n")[0]).toBe(t.columns.join(","));
    }
  });

  it("CSV export escapes quotes and neutralizes spreadsheet formulas", () => {
    const csv = toCsv({ title: "", description: "", columns: ["a", "b"], rows: [["=HYPERLINK(\"x\")", "-12.5"], ["hi, \"there\"", 3]] });
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(",-12.5");
    expect(csv).toContain(`"hi, ""there"""`);
  });
});
