import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui";
import { getSettings } from "@/lib/settings";
import { CheckList, FaqList, PageIntro, Section } from "../_components/Blocks";
import { JsonLd } from "../_components/JsonLd";
import { COMMUNITY_FAQS, COMMUNITY_TYPES, PARTNERSHIP_MARKETS, PARTNERSHIP_RADIUS_MILES, REGION_LINE } from "@/lib/community";
import { telHref } from "../_lib/format";
import { pageMetadata, residentProgramJsonLd } from "../_lib/seo";
import { InquiryForm } from "./InquiryForm";

export const metadata: Metadata = pageMetadata({
  path: "/senior-living",
  title: "Senior Living Technology Support Programs for Residents",
  description:
    "Recurring, on-site resident technology support for independent living, assisted living, retirement, CCRC, and 55+ communities in East-Central and Northeast Ohio. Request a custom partnership proposal.",
});

const PROGRAM_STEPS = [
  { title: "Choose a support schedule", text: "Your community chooses how often we visit and how long each session lasts, such as monthly or twice a month." },
  { title: "We coordinate appointments", text: "Kindred coordinates resident appointments ahead of each visit, so your staff does not have to manage a sign-up list." },
  { title: "A technician visits on schedule", text: "A Kindred technician comes to your community on the scheduled days and sets up in a quiet, convenient space." },
  { title: "One-on-one help for residents", text: "Each resident receives patient, one-on-one assistance with their own devices, explained in plain language." },
  { title: "A usage summary for management", text: "Community management receives a summary of program usage without unnecessary personal information about residents." },
];

const BENEFITS = [
  { title: "A valuable resident amenity", text: "Scheduled technology help is a practical, everyday service your community can offer residents and mention to families." },
  { title: "Fewer technology questions for staff", text: "Residents have a dedicated time and place to bring device questions, so fewer of them land on your team." },
  { title: "More confident, connected residents", text: "Help with video calls, photos, and messages makes it easier for residents to stay in touch with the people they care about." },
  { title: "Predictable scheduling", text: "Visits happen on agreed days, so residents and staff always know when help is coming." },
  { title: "Personalized assistance", text: "Every resident works one-on-one with a technician, at their own pace, on the questions that matter to them." },
  { title: "No dedicated technology hire", text: "Offer regular technology support without recruiting or managing a technology employee." },
];

const OTHER_OPTIONS = [
  {
    title: "Single community-sponsored session",
    text: "Start with one scheduled support session paid by the community, so residents and staff can see how it works before choosing a recurring schedule.",
  },
  {
    title: "Resident-paid support sessions",
    text: "We visit on a scheduled day and residents pay for their own one-on-one appointments. The community provides the space and helps share the date.",
  },
  {
    title: "Resident referral partnership",
    text: "Share our information with residents and families. Residents book in-home or remote appointments with us directly, at no cost to the community.",
  },
];

export default async function SeniorLivingPage() {
  const business = await getSettings("business");
  return (
    <>
      <JsonLd data={residentProgramJsonLd(business.name)} />
      <PageIntro
        eyebrow={`Senior living partnerships · ${REGION_LINE}`}
        title="Technology Support Your Residents Will Appreciate."
        actions={
          <>
            <ButtonLink href="#inquiry" size="lg">
              Request a Partnership Proposal
            </ButtonLink>
            <ButtonLink href="#program" variant="outline" size="lg">
              See How the Program Works
            </ButtonLink>
          </>
        }
      >
        <p>
          From video calls with family to smartphones, tablets, computers, and smart TVs, Kindred helps residents feel more confident using everyday technology. Our
          on-site support programs provide a valuable community amenity while reducing the technology-related demands on your staff.
        </p>
      </PageIntro>

      <section aria-labelledby="who-we-serve" className="border-b border-line">
        <div className="container-site py-10">
          <h2 id="who-we-serve" className="text-xl md:text-2xl">
            Communities we serve
          </h2>
          <ul className="mt-5 flex flex-wrap gap-3">
            {COMMUNITY_TYPES.filter((t) => t.value !== "OTHER_SENIOR_LIVING").map((t) => (
              <li key={t.value} className="rounded-full border border-line bg-white px-4 py-2 font-semibold text-navy">
                {t.label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="program" aria-labelledby="program-title" className="scroll-mt-4">
        <div className="container-site py-12 md:py-16">
          <div className="rounded-lg border-2 border-navy bg-white p-6 md:p-10">
            <p className="text-sm font-semibold uppercase tracking-wider text-green-dark">Our primary partnership</p>
            <h2 id="program-title" className="mt-1 text-2xl md:text-3xl">
              Recurring Resident Technology Support Program
            </h2>
            <p className="mt-3 max-w-3xl text-lg">
              A dependable monthly program that brings scheduled, on-site technology assistance to your residents. You choose the schedule, we handle the appointments,
              and residents get patient, one-on-one help from a familiar Kindred technician.
            </p>
            <h3 className="mt-8 text-xl">How it works</h3>
            <ol className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-5">
              {PROGRAM_STEPS.map((s, i) => (
                <li key={s.title} className="rounded-lg border border-line bg-soft p-5">
                  <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-full bg-navy font-heading text-lg font-bold text-white">
                    {i + 1}
                  </span>
                  <h4 className="mt-3 font-heading text-lg font-bold text-navy">
                    <span className="sr-only">Step {i + 1}: </span>
                    {s.title}
                  </h4>
                  <p className="mt-2">{s.text}</p>
                </li>
              ))}
            </ol>
            <div className="mt-8 flex flex-col gap-4 border-t border-line pt-6 md:flex-row md:items-center md:justify-between">
              <p className="max-w-2xl">
                <span className="font-semibold text-navy">Pricing is custom quoted</span> based on how often we visit, the length of each session, and the size of your
                community. We will prepare a written proposal for your review.
              </p>
              <ButtonLink href="#inquiry" size="lg">
                Request a Partnership Proposal
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      <Section id="benefits" title="Why communities choose a resident technology program" tone="white">
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b) => (
            <li key={b.title} className="rounded-lg border-t-4 border-green bg-soft p-6">
              <h3 className="text-lg">{b.title}</h3>
              <p className="mt-2">{b.text}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="example-visit" title="What a typical support visit looks like">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="text-lg">
              During a three-hour support session, residents can reserve individual appointments for help with smartphones, tablets, email, video calls, streaming
              services, computers, and other everyday technology needs.
            </p>
            <p className="mt-4">
              The number of residents we can see in a session depends on the complexity and duration of each resident&apos;s needs. A quick question about a phone
              setting takes less time than setting up a new tablet, so we plan appointment lengths with you and adjust as we learn what your residents need most.
            </p>
            <h3 className="mt-8 text-xl">Common topics residents bring</h3>
            <div className="mt-4">
              <CheckList
                columns={2}
                items={[
                  "Video calls with family",
                  "Making text bigger and sound clearer",
                  "Photos: viewing, sharing, and freeing up space",
                  "Email, passwords, and sign-ins",
                  "Recognizing scam calls, texts, and pop-ups",
                  "Smart TVs and streaming services",
                  "E-readers and audiobooks",
                  "Patient portals and pharmacy apps",
                ]}
              />
            </div>
          </div>
          <div className="self-start rounded-lg border border-line bg-white p-6">
            <h3 className="text-xl">What we ask of the community</h3>
            <div className="mt-4">
              <CheckList
                items={[
                  "A quiet room or corner with a table, chairs, and an electrical outlet",
                  "Access to guest Wi-Fi",
                  "Help sharing the schedule through your newsletter, calendar, or front desk",
                  "A staff contact for scheduling questions",
                ]}
              />
            </div>
            <p className="mt-4 text-sm">We do not need access to your community&apos;s internal systems, records, or software.</p>
          </div>
        </div>
      </Section>

      <Section
        id="other-options"
        title="Other ways to partner"
        tone="white"
        intro="Not ready for a recurring program? These arrangements are also available, and many communities start here."
      >
        <ul className="grid gap-5 md:grid-cols-3">
          {OTHER_OPTIONS.map((o) => (
            <li key={o.title} className="rounded-lg border border-line bg-soft p-6">
              <h3 className="text-lg">{o.title}</h3>
              <p className="mt-2">{o.text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6">
          All community partnerships are custom quoted. Individual residents and families can always book our{" "}
          <Link href="/pricing">standard residential services</Link> at the published prices.
        </p>
      </Section>

      <Section id="privacy" title="Resident privacy comes first">
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-lg border border-line bg-white p-6">
            <h3 className="text-lg">Private, one-on-one sessions</h3>
            <p className="mt-2">Each resident works with us individually. What a resident shows us on their device stays between them and us.</p>
          </div>
          <div className="rounded-lg border border-line bg-white p-6">
            <h3 className="text-lg">Summaries without personal details</h3>
            <p className="mt-2">
              Management receives program usage information, such as the number of sessions held. Details of an individual resident&apos;s session are shared only with
              that resident&apos;s permission.
            </p>
          </div>
          <div className="rounded-lg border border-line bg-white p-6">
            <h3 className="text-lg">Permission before changes</h3>
            <p className="mt-2">
              We explain what we are doing and ask before changing anything. We never ask for banking passwords, and residents decide what is shared with family.
            </p>
          </div>
        </div>
      </Section>

      <Section id="territory" title={REGION_LINE} tone="white">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="text-lg">
              Kindred is based in Tuscarawas County. We offer community partnerships to senior living and 55+ communities within approximately {PARTNERSHIP_RADIUS_MILES}{" "}
              miles of Gnadenhutten, Ohio, including:
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {PARTNERSHIP_MARKETS.map((m) => (
                <li key={m} className="flex gap-2">
                  <span aria-hidden="true" className="text-green">
                    &bull;
                  </span>
                  {m}
                </li>
              ))}
              <li className="flex gap-2">
                <span aria-hidden="true" className="text-green">
                  &bull;
                </span>
                Other qualifying communities within our service territory
              </li>
            </ul>
          </div>
          <div className="self-start rounded-lg border border-line bg-soft p-6">
            <p>
              We confirm availability for each community before preparing a proposal. Residential in-home visits for individuals follow our{" "}
              <Link href="/service-areas">residential service area</Link>.
            </p>
          </div>
        </div>
      </Section>

      <Section id="community-faq" title="Community partnership questions">
        <div className="max-w-3xl">
          <FaqList items={COMMUNITY_FAQS} />
        </div>
      </Section>

      <section aria-labelledby="inquiry-title" id="inquiry" className="scroll-mt-4 border-t border-line bg-white">
        <div className="container-site grid gap-10 py-12 md:py-16 lg:grid-cols-[1fr_1.5fr]">
          <div>
            <h2 id="inquiry-title" className="text-2xl md:text-3xl">
              Request a Community Partnership Proposal
            </h2>
            <p className="mt-4 text-lg">
              Tell us about your community and the schedule you have in mind. We will contact you within two business days to learn more and prepare a custom proposal.
              There is no obligation.
            </p>
            <p className="mt-4">
              This form is for senior living communities. Individuals and families can <Link href="/schedule">schedule a visit</Link> directly.
            </p>
            {(business.phone || business.email) && (
              <div className="mt-6">
                <p className="font-semibold text-navy">Prefer to reach us directly?</p>
                <ul className="mt-2 space-y-1">
                  {business.phone && (
                    <li>
                      Phone: <a href={telHref(business.phone)}>{business.phone}</a>
                    </li>
                  )}
                  {business.email && (
                    <li>
                      Email: <a href={`mailto:${business.email}`}>{business.email}</a>
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
          <div className="rounded-lg border border-line bg-soft p-5 md:p-8">
            <InquiryForm />
          </div>
        </div>
      </section>
    </>
  );
}
