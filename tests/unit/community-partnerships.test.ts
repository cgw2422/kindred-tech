import { describe, expect, it } from "vitest";
import { facilityInquirySchema } from "@/app/(public)/senior-living/schema";
import { COMMUNITY_FAQS, COMMUNITY_TYPES, facilityTypeForCommunity, PARTNERSHIP_MARKETS, VISIT_FREQUENCIES } from "@/lib/community";
import { SERVICE_PAGES } from "@/app/(public)/services/content";
import { residentProgramJsonLd } from "@/app/(public)/_lib/seo";

const valid = {
  facilityName: "Example Senior Living",
  city: "Dover",
  state: "oh",
  contactName: "Pat Example",
  contactTitle: "Executive Director",
  email: "pat@example.com",
  phone: "330-555-0100",
  communityType: "INDEPENDENT_LIVING",
  residentCount: "120",
  visitFrequency: "MONTHLY",
  interest: "RECURRING_CONTRACT",
  message: "",
};

describe("community partnership inquiry form", () => {
  it("accepts a complete request and normalizes the state", () => {
    const r = facilityInquirySchema.safeParse(valid);
    expect(r.success).toBe(true);
    expect(r.data?.state).toBe("OH");
  });
  it("requires community name, city, state, contact name, email, and community type", () => {
    const r = facilityInquirySchema.safeParse({ ...valid, facilityName: "", city: "", state: "", contactName: "", email: "", communityType: "" });
    expect(r.success).toBe(false);
    const fields = r.error!.issues.map((i) => i.path[0]);
    expect(fields).toEqual(expect.arrayContaining(["facilityName", "city", "state", "contactName", "email", "communityType"]));
  });
  it("keeps phone, residents, frequency, program and message optional", () => {
    expect(facilityInquirySchema.safeParse({ ...valid, phone: "", residentCount: "", visitFrequency: "", interest: "", message: "" }).success).toBe(true);
  });
  it("rejects values outside the option lists", () => {
    expect(facilityInquirySchema.safeParse({ ...valid, communityType: "APARTMENTS" }).success).toBe(false);
    expect(facilityInquirySchema.safeParse({ ...valid, visitFrequency: "DAILY" }).success).toBe(false);
  });
});

describe("community partnership content", () => {
  it("covers the five community types we serve and no general apartments", () => {
    const labels = COMMUNITY_TYPES.map((t) => t.label.toLowerCase()).join(" | ");
    for (const kind of ["independent living", "assisted living", "retirement community", "continuing care", "55+"]) expect(labels).toContain(kind);
    expect(labels).not.toMatch(/apartment/);
  });
  it("answers all ten required community FAQ questions", () => {
    const qs = COMMUNITY_FAQS.map((f) => f.question);
    expect(qs).toHaveLength(10);
    for (const q of [/types of communities/, /community or the resident pay/, /How often/, /technology issues/, /in advance/, /families/, /community systems/, /privacy/, /single paid visit/, /request a proposal/]) {
      expect(qs.some((x) => q.test(x)), String(q)).toBe(true);
    }
  });
  it("never publishes community package prices", () => {
    const text = JSON.stringify({ COMMUNITY_FAQS, PARTNERSHIP_MARKETS, VISIT_FREQUENCIES });
    expect(text).not.toMatch(/\$\s?\d/);
    expect(text).not.toMatch(/399|749|1,?399/);
  });
  it("maps community types to CRM facility types", () => {
    expect(facilityTypeForCommunity("CCRC")).toBe("CONTINUING_CARE");
    expect(facilityTypeForCommunity("ACTIVE_ADULT_55")).toBe("OTHER");
    expect(facilityTypeForCommunity(null)).toBeNull();
  });
  it("structured data describes a service radius, not office locations", () => {
    const ld = residentProgramJsonLd("Kindred Tech Support");
    expect(ld.areaServed[0]).toMatchObject({ "@type": "GeoCircle" });
    expect(JSON.stringify(ld)).not.toMatch(/PostalAddress|streetAddress/);
  });
  it("keeps all eight service categories", () => {
    expect(SERVICE_PAGES).toHaveLength(8);
  });
});
