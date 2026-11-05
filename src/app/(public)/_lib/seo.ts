import type { Metadata } from "next";
import { env } from "@/lib/env";
import { PARTNERSHIP_CENTER, PARTNERSHIP_CITIES, PARTNERSHIP_RADIUS_MILES } from "@/lib/community";

/** Absolute URL for a public path. */
export function absoluteUrl(path: string): string {
  return `${env.appUrl}${path === "/" ? "/" : path}`;
}

/** Standard page metadata with a canonical URL and matching Open Graph data. */
export function pageMetadata({ path, title, description, absoluteTitle = false }: { path: string; title: string; description: string; absoluteTitle?: boolean }): Metadata {
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, type: "website", siteName: "Kindred Tech Support" },
  };
}

/** Serializes JSON-LD safely for inline <script> tags (no "</script>" breakouts). */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

export type BusinessInfo = { name: string; phone: string; email: string; tagline?: string };

export function localBusinessJsonLd(biz: BusinessInfo, areas: { county: string; state: string; communities: string[] }[]) {
  const areaServed = [
    ...areas.map((a) => ({ "@type": "AdministrativeArea", name: `${a.county} County, ${a.state === "OH" ? "Ohio" : a.state}` })),
    ...areas.flatMap((a) => a.communities.map((c) => ({ "@type": "City", name: `${c}, ${a.state === "OH" ? "Ohio" : a.state}` }))),
  ];
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "@id": `${env.appUrl}/#business`,
    name: biz.name,
    slogan: biz.tagline || undefined,
    url: env.appUrl,
    logo: `${env.appUrl}/icon-512.png`,
    image: `${env.appUrl}/icon-512.png`,
    description:
      "Patient in-home and remote technology help for seniors and families in Tuscarawas County, Ohio, and on-site resident technology support programs for senior living communities in East-Central and Northeast Ohio.",
    ...(biz.phone ? { telephone: biz.phone } : {}),
    ...(biz.email ? { email: biz.email } : {}),
    areaServed: [...areaServed, partnershipGeoCircle()],
  };
}

/** The community-partnership territory (about 75 miles around Gnadenhutten). Not an office location. */
export function partnershipGeoCircle() {
  return {
    "@type": "GeoCircle",
    geoMidpoint: { "@type": "GeoCoordinates", latitude: PARTNERSHIP_CENTER.lat, longitude: PARTNERSHIP_CENTER.lng },
    geoRadius: Math.round(PARTNERSHIP_RADIUS_MILES * 1609.344),
  };
}

/** Service schema for the senior living resident technology support program. */
export function residentProgramJsonLd(providerName: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Resident Technology Support Program for Senior Living Communities",
    serviceType: "Senior living technology support",
    description:
      "Recurring, on-site technology assistance for residents of independent living, assisted living, retirement, continuing care, and 55+ communities. Custom-quoted community partnerships.",
    url: absoluteUrl("/senior-living"),
    audience: { "@type": "BusinessAudience", name: "Senior living and 55+ communities" },
    provider: { "@type": "ProfessionalService", "@id": `${env.appUrl}/#business`, name: providerName, url: env.appUrl },
    areaServed: [partnershipGeoCircle(), ...PARTNERSHIP_CITIES.map((c) => ({ "@type": "City", name: `${c}, Ohio` }))],
  };
}

export function serviceJsonLd({ name, description, path, providerName }: { name: string; description: string; path: string; providerName: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name,
    description,
    url: absoluteUrl(path),
    serviceType: name,
    provider: { "@type": "ProfessionalService", "@id": `${env.appUrl}/#business`, name: providerName, url: env.appUrl },
    areaServed: { "@type": "AdministrativeArea", name: "Tuscarawas County, Ohio" },
  };
}

export function faqJsonLd(items: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.question, acceptedAnswer: { "@type": "Answer", text: i.answer } })),
  };
}
