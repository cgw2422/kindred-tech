import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { CheckList, CtaBand } from "./_components/Blocks";
import { JsonLd } from "./_components/JsonLd";
import { getActiveServiceAreas, getKindredCarePlan } from "./_lib/data";
import { joinList } from "./_lib/format";
import { localBusinessJsonLd, pageMetadata } from "./_lib/seo";
import { SERVICE_PAGES } from "./services/content";

export const metadata: Metadata = pageMetadata({
  path: "/",
  absoluteTitle: true,
  title: "Kindred Tech Support | In-Home Technology Help in Tuscarawas County, Ohio",
  description:
    "Friendly, patient technology help in the comfort of your own home. Computer, smartphone, Wi-Fi, TV, online safety, and subscription help for seniors and families in Tuscarawas County, Ohio.",
});

const STEPS = [
  {
    title: "Schedule a visit",
    text: "Book online or reach out to us. Tell us what is going on in your own words. A family member can book on your behalf.",
  },
  {
    title: "We confirm the details",
    text: "We confirm your appointment, the price, and what to have ready, so there are no surprises when we arrive.",
  },
  {
    title: "Patient help at home",
    text: "We work on your own devices, at your pace, explain everything in plain language, and can leave written notes behind.",
  },
];

const PROMISES = [
  { title: "Patience, always", text: "No question is too basic, and we are happy to explain something again. You set the pace." },
  { title: "Plain language", text: "We explain what we are doing without jargon, and we tell you what something costs before we do it." },
  { title: "We never ask for banking passwords", text: "We will never request your online banking password or PIN, and we only make changes with your permission." },
  { title: "Written notes to keep", text: "We can leave clear, written steps behind so you can remember how to do it after we leave." },
];

export default async function HomePage() {
  const [business, areas, plan] = await Promise.all([getSettings("business"), getActiveServiceAreas(), getKindredCarePlan()]);
  const counties = areas.map((a) => `${a.county} County`);
  const communities = areas.flatMap((a) => a.communities);

  return (
    <>
      <JsonLd data={localBusinessJsonLd(business, areas)} />

      {/* Hero */}
      <section aria-labelledby="hero-title" className="border-b border-line bg-white">
        <div className="container-site grid items-center gap-10 py-14 md:py-20 lg:grid-cols-[1.25fr_1fr]">
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-green-dark">{business.tagline}</p>
            <h1 id="hero-title" className="text-4xl md:text-5xl lg:text-[3.4rem]">
              Technology Should Be Simple.
            </h1>
            <p className="mt-5 max-w-xl text-xl md:text-2xl">Friendly, patient technology help in the comfort of your own home.</p>
            <p className="mt-4 max-w-xl text-lg">
              We help seniors, families, and senior living communities in {counties.length ? joinList(counties) : "Tuscarawas County"}, Ohio with computers, phones,
              tablets, Wi-Fi, TVs, and staying safe online.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/schedule" size="lg">
                Schedule a Visit
              </ButtonLink>
              <ButtonLink href="/services" variant="outline" size="lg">
                Explore Our Services
              </ButtonLink>
            </div>
            {business.phone && (
              <p className="mt-5 text-lg">
                Prefer to talk to a person? Call{" "}
                <a href={`tel:${business.phone.replace(/[^\d+]/g, "")}`} className="font-semibold">
                  {business.phone}
                </a>
                .
              </p>
            )}
          </div>
          <div className="rounded-lg border border-line bg-soft p-6 md:p-8">
            <h2 className="text-xl md:text-2xl">{business.secondaryTagline}</h2>
            <ul className="mt-5 space-y-4">
              {[
                ["In your home", "Help at your own kitchen table, on your own devices."],
                ["At your pace", "We take the time to explain, and repeat as often as you like."],
                ["Family friendly", "Adult children can arrange and pay for help for a parent."],
              ].map(([t, d]) => (
                <li key={t} className="border-l-4 border-green pl-4">
                  <p className="font-semibold text-navy">{t}</p>
                  <p>{d}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-title">
        <div className="container-site py-14 md:py-16">
          <h2 id="how-title" className="text-2xl md:text-3xl">
            How it works
          </h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-lg border border-line bg-white p-6">
                <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-navy font-heading text-xl font-bold text-white">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-xl">
                  <span className="sr-only">Step {i + 1}: </span>
                  {s.title}
                </h3>
                <p className="mt-2">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Services */}
      <section aria-labelledby="services-title" className="border-y border-line bg-white">
        <div className="container-site py-14 md:py-16">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <h2 id="services-title" className="text-2xl md:text-3xl">
                How we can help
              </h2>
              <p className="mt-3 text-lg">From a confusing remote to a suspicious email, we help with the everyday technology that matters to you.</p>
            </div>
            <Link href="/services" className="font-semibold">
              View all services and prices
            </Link>
          </div>
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICE_PAGES.map((p) => (
              <li key={p.slug} className="flex">
                <Link href={`/services/${p.slug}`} className="group flex w-full flex-col rounded-lg border border-line bg-soft p-5 no-underline transition-colors hover:border-navy">
                  <span className="font-heading text-lg font-bold text-navy group-hover:underline">{p.name}</span>
                  <span className="mt-2 text-body">{p.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Who we help */}
      <section aria-labelledby="who-title">
        <div className="container-site py-14 md:py-16">
          <h2 id="who-title" className="text-2xl md:text-3xl">
            Who we help
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <div className="rounded-lg border border-line bg-white p-6">
              <h3 className="text-xl">Seniors at home</h3>
              <p className="mt-2">
                Whether you are brand new to technology or just stuck on one thing, we help in your home with your own devices, without hurry and without talking down to
                you.
              </p>
            </div>
            <div className="rounded-lg border border-line bg-white p-6">
              <h3 className="text-xl">Families helping a parent</h3>
              <p className="mt-2">
                Live far away, or simply short on time? You can book and pay for a visit for your mother or father. Family members can schedule and pay without seeing
                private details, and your parent decides what is shared with you.
              </p>
            </div>
            <div className="rounded-lg border border-line bg-white p-6">
              <h3 className="text-xl">Senior living communities</h3>
              <p className="mt-2">
                We partner with independent living, assisted living, and senior apartment communities to bring on-site technology help to residents.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Senior living partnerships */}
      <section aria-labelledby="senior-living-title" className="bg-navy text-white">
        <div className="container-site grid gap-8 py-14 md:py-16 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-green-light">For senior living communities</p>
            <h2 id="senior-living-title" className="text-2xl text-white md:text-3xl">
              Bring a Tech Help Day to your residents
            </h2>
            <p className="mt-4 text-lg text-white/90">
              Residents meet with us one at a time in a common room for help with phones, tablets, hearing-aid apps, email, and video calls with family. Choose the
              arrangement that suits your community, from simple resident referrals to a recurring on-site schedule.
            </p>
            <div className="mt-7">
              <ButtonLink href="/senior-living" variant="light" size="lg">
                Explore Community Partnerships
              </ButtonLink>
            </div>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {["Resident Referral Partner", "Resident-Paid Tech Help Day", "Facility-Sponsored Tech Help Day", "Recurring Facility Contract"].map((m) => (
              <li key={m} className="rounded-md border border-white/25 p-4 font-semibold">
                {m}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Subscription review */}
      <section aria-labelledby="subscription-title">
        <div className="container-site py-14 md:py-16">
          <div className="grid gap-8 rounded-lg border border-line bg-white p-6 md:p-10 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-green-dark">Subscription Review &amp; Savings</p>
              <h2 id="subscription-title" className="text-2xl md:text-3xl">
                Paying for things you do not use?
              </h2>
              <p className="mt-4 text-lg">
                Streaming services, antivirus renewals, cloud storage, and app subscriptions add up quietly. We review your recurring technology charges with you, explain
                each one, and help you cancel or change only what you decide.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <ButtonLink href="/services/subscription-review-savings" variant="secondary">
                  Learn About Subscription Reviews
                </ButtonLink>
              </div>
            </div>
            <div className="rounded-md bg-green-light p-5">
              <h3 className="text-lg">Our commitments</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-navy-dark">
                <li>No changes without your authorization</li>
                <li>We never ask for or store online banking passwords</li>
                <li>We do not access your financial accounts</li>
                <li>Savings are not guaranteed, but you will know exactly what you pay for</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Membership */}
      {plan && (
        <section aria-labelledby="membership-title" className="border-y border-line bg-white">
          <div className="container-site grid gap-8 py-14 md:py-16 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-green-dark">Membership</p>
              <h2 id="membership-title" className="text-2xl md:text-3xl">
                {plan.name}
              </h2>
              <p className="mt-4 text-lg">{plan.description}</p>
              <p className="mt-4">
                <span className="font-heading text-3xl font-bold text-navy">{formatCents(plan.priceCents)}</span>{" "}
                <span className="text-lg">per {plan.interval === "YEAR" ? "year" : "month"}</span>
              </p>
              <div className="mt-6">
                <ButtonLink href="/pricing#membership" variant="outline">
                  See Membership Details
                </ButtonLink>
              </div>
            </div>
            {plan.benefitsText.length > 0 && (
              <div className="rounded-lg border border-line bg-soft p-6">
                <h3 className="text-lg">What is included</h3>
                <div className="mt-4">
                  <CheckList items={plan.benefitsText} />
                </div>
                <p className="mt-4 text-sm">Membership does not include unlimited in-home visits.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Promises */}
      <section aria-labelledby="promises-title">
        <div className="container-site py-14 md:py-16">
          <h2 id="promises-title" className="text-2xl md:text-3xl">
            What you can expect from us
          </h2>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PROMISES.map((p) => (
              <li key={p.title} className="rounded-lg border-t-4 border-green bg-white p-6 shadow-sm">
                <h3 className="text-lg">{p.title}</h3>
                <p className="mt-2">{p.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Service area */}
      <section aria-labelledby="area-title" className="border-t border-line bg-white">
        <div className="container-site py-14 md:py-16">
          <h2 id="area-title" className="text-2xl md:text-3xl">
            Proudly serving {counties.length ? joinList(counties) : "Tuscarawas County"}, Ohio
          </h2>
          {communities.length > 0 && <p className="mt-4 max-w-3xl text-lg">Including {joinList(communities)}.</p>}
          <p className="mt-4 max-w-3xl">
            We plan to expand to neighboring Ohio counties. If you live nearby, please reach out. We may still be able to help, especially by phone or screen sharing.
          </p>
          <p className="mt-6">
            <Link href="/service-areas" className="font-semibold">
              See our full service area and ZIP codes
            </Link>
          </p>
        </div>
      </section>

      <CtaBand title="Let us make technology simple again" secondary={{ href: "/contact", label: "Contact Us" }}>
        Schedule a visit online in a few minutes. We will confirm your appointment and answer any questions before we arrive.
      </CtaBand>
    </>
  );
}
