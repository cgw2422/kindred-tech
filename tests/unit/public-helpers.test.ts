import { describe, expect, it } from "vitest";
import { durationLabel, extensionLabel, joinList, servicePriceLabel, telHref, travelFeeSummary } from "@/app/(public)/_lib/format";
import { faqJsonLd, localBusinessJsonLd, serializeJsonLd } from "@/app/(public)/_lib/seo";
import { SERVICE_PAGES } from "@/app/(public)/services/content";
import { ALL_FAQS } from "@/app/(public)/faq/faqs";
import { SERVICE_NAV } from "@/components/site/SiteHeader";
import { facilityInquirySchema } from "@/app/(public)/senior-living/schema";
import { contactSchema } from "@/app/(public)/contact/schema";

describe("public price helpers", () => {
  it("formats prices by pricing type", () => {
    expect(servicePriceLabel({ pricingType: "FIXED", basePriceCents: 9900 })).toBe("$99");
    expect(servicePriceLabel({ pricingType: "STARTING_AT", basePriceCents: 14900 })).toBe("Starting at $149");
    expect(servicePriceLabel({ pricingType: "CUSTOM_QUOTE", basePriceCents: 0 })).toBe("Custom pricing");
  });
  it("formats extensions and durations", () => {
    expect(extensionLabel({ pricingType: "FIXED", basePriceCents: 1, extensionMinutes: 30, extensionPriceCents: 4000 })).toBe("Additional 30 minutes: $40");
    expect(extensionLabel({ pricingType: "FIXED", basePriceCents: 1 })).toBeNull();
    expect(durationLabel(60)).toBe("1 hour");
    expect(durationLabel(90)).toBe("90 minutes");
    expect(durationLabel(120)).toBe("2 hours");
    expect(durationLabel(30)).toBe("30 minutes");
  });
  it("summarizes travel fees", () => {
    expect(travelFeeSummary([0])).toMatch(/no travel fee/);
    expect(travelFeeSummary([])).toMatch(/no travel fee/);
    expect(travelFeeSummary([0, 1500])).toMatch(/\$15/);
    expect(travelFeeSummary([1000, 2000])).toMatch(/\$10 to \$20/);
  });
  it("misc helpers", () => {
    expect(telHref("(330) 555-0100")).toBe("tel:3305550100");
    expect(joinList(["A", "B", "C"])).toBe("A, B, and C");
    expect(joinList(["A", "B"])).toBe("A and B");
  });
});

describe("structured data", () => {
  it("escapes markup in JSON-LD", () => {
    const out = serializeJsonLd({ x: "</script><b>&" });
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(JSON.parse(out)).toEqual({ x: "</script><b>&" });
  });
  it("omits telephone when not configured", () => {
    const ld = localBusinessJsonLd({ name: "K", phone: "", email: "" }, [{ county: "Tuscarawas", state: "OH", communities: ["Dover"] }]);
    expect(ld).not.toHaveProperty("telephone");
    expect(ld).not.toHaveProperty("address");
    expect(ld).not.toHaveProperty("aggregateRating");
    expect(ld.areaServed[0].name).toBe("Tuscarawas County, Ohio");
    expect(localBusinessJsonLd({ name: "K", phone: "330", email: "" }, [])).toHaveProperty("telephone", "330");
  });
  it("builds FAQ JSON-LD with at least 15 questions", () => {
    expect(ALL_FAQS.length).toBeGreaterThanOrEqual(15);
    expect(faqJsonLd(ALL_FAQS).mainEntity).toHaveLength(ALL_FAQS.length);
  });
});

describe("service pages", () => {
  it("covers exactly the header navigation URLs", () => {
    expect(SERVICE_PAGES.map((p) => `/services/${p.slug}`).sort()).toEqual(SERVICE_NAV.map((n) => n.href).sort());
  });
  it("subscription review page states the required commitments", () => {
    const text = JSON.stringify(SERVICE_PAGES.find((p) => p.slug === "subscription-review-savings"));
    expect(text).toMatch(/authorization is required before any change/i);
    expect(text).toMatch(/never request or store your online banking passwords/i);
    expect(text).toMatch(/do not access your bank/i);
    expect(text).toMatch(/Savings are not guaranteed/);
  });
});

describe("form schemas", () => {
  const base = { facilityName: "Oak Grove", contactName: "Pat", contactTitle: "", email: "pat@example.com", phone: "", city: "", residentCount: "", interest: "", message: "" };
  it("validates facility inquiries", () => {
    expect(facilityInquirySchema.safeParse(base).success).toBe(true);
    expect(facilityInquirySchema.safeParse({ ...base, email: "" }).success).toBe(false);
    expect(facilityInquirySchema.safeParse({ ...base, residentCount: "lots" }).success).toBe(false);
    expect(facilityInquirySchema.safeParse({ ...base, interest: "BOGUS" }).success).toBe(false);
  });
  it("requires an email or phone on contact messages", () => {
    const c = { name: "Pat", email: "", phone: "", topic: "", message: "Need help with my phone" };
    expect(contactSchema.safeParse(c).success).toBe(false);
    expect(contactSchema.safeParse({ ...c, phone: "330-555-0100" }).success).toBe(true);
  });
});
