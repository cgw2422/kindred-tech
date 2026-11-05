import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui";
import { CtaBand, PageIntro, Section } from "../_components/Blocks";
import { getActiveServices } from "../_lib/data";
import { durationLabel, extensionLabel, servicePriceLabel } from "../_lib/format";
import { pageMetadata } from "../_lib/seo";
import { SERVICE_PAGES } from "./content";
import { getPageImages } from "@/lib/media/service";
import { SlotImage } from "@/components/media/SlotImage";

export const metadata: Metadata = pageMetadata({
  path: "/services",
  title: "Senior Technology Help Services and Prices",
  description:
    "In-home and remote technology help for seniors: computers, smartphones, tablets, Wi-Fi, smart TVs, lessons, scam protection, subscription reviews, and checkups. Clear prices in Tuscarawas County, Ohio.",
});

type CatalogService = Awaited<ReturnType<typeof getActiveServices>>[number];

function whereLabel(s: CatalogService) {
  if (s.isRemote) return "By phone or secure screen sharing";
  if (!s.isBookableOnline) return "On site at a senior living community";
  return "In your home";
}

function timeLabel(s: CatalogService) {
  if (s.pricingType === "CUSTOM_QUOTE") return "Length set with your community";
  return s.pricingType === "STARTING_AT" ? `About ${durationLabel(s.durationMinutes)}` : `Up to ${durationLabel(s.durationMinutes)}`;
}

export default async function ServicesPage() {
  const [services, images] = await Promise.all([getActiveServices(), getPageImages(["services-featured"])]);
  const featured = images["services-featured"];
  const bySlug = new Map(services.map((s) => [s.slug, s]));
  const residential = services.filter((s) => s.isBookableOnline);
  const community = services.filter((s) => !s.isBookableOnline);

  return (
    <>
      <PageIntro
        eyebrow="Our services"
        title="Patient help with the technology in your life"
        media={featured ? <SlotImage slotKey="services-featured" image={featured} /> : undefined}
        actions={
          <>
            <ButtonLink href="/schedule" size="lg">
              Schedule a Visit
            </ButtonLink>
            <ButtonLink href="/pricing" variant="outline" size="lg">
              See Pricing Details
            </ButtonLink>
          </>
        }
      >
        <p>
          We help with almost anything that plugs in, connects to Wi-Fi, or asks for a password. Most visits take place in your home, and many quick questions can
          be handled by phone or secure screen sharing. You always know the price before we begin.
        </p>
      </PageIntro>

      <Section id="help-topics" title="What we can help with" intro="Each card shows what is included, how long a typical appointment lasts, and what it costs.">
        <ul className="grid gap-6 md:grid-cols-2">
          {SERVICE_PAGES.map((p) => {
            const primary = p.scheduleServiceSlug ? bySlug.get(p.scheduleServiceSlug) : undefined;
            const scheduleHref = primary?.isBookableOnline ? `/schedule?service=${encodeURIComponent(primary.slug)}` : "/schedule";
            const headingId = `topic-${p.slug}`;
            return (
              <li key={p.slug} className="flex">
                <article aria-labelledby={headingId} className="flex w-full flex-col rounded-lg border border-line bg-white p-6">
                  <h3 id={headingId} className="text-xl">
                    {p.name}
                  </h3>
                  <p className="mt-2">{p.summary}</p>
                  <h4 className="mt-4 font-semibold text-navy">Includes help with</h4>
                  <ul className="mt-2 list-disc space-y-1 pl-6">
                    {p.helpWith.slice(0, 3).map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                  {primary && (
                    <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md bg-soft p-4">
                      <dt className="font-semibold text-navy">Appointment</dt>
                      <dd>{primary.name}</dd>
                      <dt className="font-semibold text-navy">Length</dt>
                      <dd>{timeLabel(primary)}</dd>
                      <dt className="font-semibold text-navy">Price</dt>
                      <dd className="font-semibold text-green-dark">{servicePriceLabel(primary)}</dd>
                    </dl>
                  )}
                  <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 pt-5">
                    <ButtonLink href={scheduleHref}>Schedule a Visit</ButtonLink>
                    <Link href={`/services/${p.slug}`} className="inline-flex min-h-[44px] items-center font-semibold">
                      Details<span className="sr-only"> about {p.name}</span>
                    </Link>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section
        id="service-prices"
        title="Appointment types and prices"
        tone="white"
        intro="Prices are confirmed with you before any work begins. If more time or additional work is needed, we explain the cost and ask first."
      >
        {residential.length === 0 ? (
          <p>Our service list is being updated. Please contact us for current pricing.</p>
        ) : (
          <ul className="grid gap-5 md:grid-cols-2">
            {residential.map((s) => {
              const ext = extensionLabel(s);
              const headingId = `svc-${s.slug}`;
              return (
                <li key={s.id} className="flex">
                  <article aria-labelledby={headingId} className="flex w-full flex-col rounded-lg border border-line bg-soft p-5 md:p-6">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <h3 id={headingId} className="text-xl">
                        {s.name}
                      </h3>
                      <p className="font-heading text-xl font-bold text-green-dark">{servicePriceLabel(s)}</p>
                    </div>
                    <p className="mt-2">{s.shortDescription}</p>
                    <p className="mt-2">
                      {whereLabel(s)} &middot; {timeLabel(s)}
                    </p>
                    {ext && <p className="mt-1">{ext}</p>}
                    <p className="mt-auto pt-4">
                      <ButtonLink href={`/schedule?service=${encodeURIComponent(s.slug)}`}>
                        Schedule a Visit<span className="sr-only">: {s.name}</span>
                      </ButtonLink>
                    </p>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <section aria-labelledby="communities-title">
        <div className="container-site py-12 md:py-16">
          <div className="grid gap-6 rounded-lg border-2 border-navy bg-white p-6 md:p-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-green-dark">For senior living and 55+ communities</p>
              <h2 id="communities-title" className="mt-1 text-2xl md:text-3xl">
                On-site technology support for your residents
              </h2>
              <p className="mt-3 text-lg">
                Kindred partners with independent living, assisted living, retirement, continuing care, and 55+ communities to provide scheduled, on-site resident
                technology support. Community partnerships are custom quoted.
              </p>
              {community.length > 0 && (
                <ul className="mt-4 space-y-1">
                  {community.map((s) => (
                    <li key={s.id}>
                      <span className="font-semibold text-navy">{s.name}:</span> {servicePriceLabel(s)}
                      {s.pricingType !== "CUSTOM_QUOTE" && ` (${durationLabel(s.durationMinutes)})`}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <ButtonLink href="/senior-living#inquiry" variant="secondary" size="lg">
                Request a Partnership Proposal
              </ButtonLink>
              <ButtonLink href="/senior-living" variant="outline" size="lg">
                Explore Community Partnerships
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      <CtaBand title="Not sure which service you need?" secondary={{ href: "/contact", label: "Contact Kindred" }}>
        Schedule a standard visit and tell us what is going on. We will figure it out together, or send us a message and we will point you in the right direction.
      </CtaBand>
    </>
  );
}
