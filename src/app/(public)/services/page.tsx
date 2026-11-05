import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui";
import { CtaBand, PageIntro, Section } from "../_components/Blocks";
import { getActiveServices } from "../_lib/data";
import { durationLabel, extensionLabel, servicePriceLabel } from "../_lib/format";
import { pageMetadata } from "../_lib/seo";
import { SERVICE_PAGES } from "./content";

export const metadata: Metadata = pageMetadata({
  path: "/services",
  title: "Technology Help Services",
  description:
    "In-home and remote technology help for computers, smartphones, tablets, Wi-Fi, TVs, online safety, and subscriptions. Clear pricing for Tuscarawas County, Ohio.",
});

export default async function ServicesPage() {
  const services = await getActiveServices();
  return (
    <>
      <PageIntro
        eyebrow="Our services"
        title="Patient help with the technology in your life"
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
          be handled by phone or secure screen sharing.
        </p>
      </PageIntro>

      <Section id="help-topics" title="What we can help with" intro="Choose a topic to learn what is included, what to expect, and common questions.">
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICE_PAGES.map((p) => (
            <li key={p.slug} className="flex">
              <Link
                href={`/services/${p.slug}`}
                className="group flex w-full flex-col rounded-lg border border-line bg-white p-5 no-underline transition-colors hover:border-navy"
              >
                <span className="font-heading text-lg font-bold text-navy group-hover:underline">{p.name}</span>
                <span className="mt-2 text-body">{p.summary}</span>
                <span className="mt-auto pt-4 font-semibold text-green-dark" aria-hidden="true">
                  Learn more
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="service-prices" title="Services and prices" tone="white" intro="Prices are confirmed with you before any work begins. There are no surprise charges.">
        {services.length === 0 ? (
          <p>Our service list is being updated. Please contact us for current pricing.</p>
        ) : (
          <ul className="grid gap-5 md:grid-cols-2">
            {services.map((s) => {
              const ext = extensionLabel(s);
              return (
                <li key={s.id} className="flex flex-col rounded-lg border border-line bg-soft p-5 md:p-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="text-xl">{s.name}</h3>
                    <p className="font-heading text-xl font-bold text-green-dark">{servicePriceLabel(s)}</p>
                  </div>
                  <p className="mt-2">{s.shortDescription}</p>
                  <p className="mt-2 text-sm text-body">
                    {s.isRemote ? "By phone or secure screen sharing" : s.pricingType === "CUSTOM_QUOTE" ? "On site at your community" : "In your home"}
                    {s.pricingType !== "CUSTOM_QUOTE" && <> &middot; {durationLabel(s.durationMinutes)}</>}
                    {ext && <> &middot; {ext}</>}
                  </p>
                  {s.isBookableOnline ? (
                    <p className="mt-auto pt-4">
                      <Link href={`/schedule?service=${encodeURIComponent(s.slug)}`} className="font-semibold">
                        Schedule {s.name}
                      </Link>
                    </p>
                  ) : (
                    <p className="mt-auto pt-4">
                      <Link href="/senior-living" className="font-semibold">
                        Learn about community partnerships
                      </Link>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <CtaBand title="Not sure which service you need?" secondary={{ href: "/contact", label: "Ask Us a Question" }}>
        Schedule a standard visit and tell us what is going on. We will figure it out together, or send us a message and we will point you in the right direction.
      </CtaBand>
    </>
  );
}
