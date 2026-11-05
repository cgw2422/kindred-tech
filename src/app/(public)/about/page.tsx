import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui";
import { getSettings } from "@/lib/settings";
import { CtaBand, PageIntro, Section } from "../_components/Blocks";
import { pageMetadata } from "../_lib/seo";

export const metadata: Metadata = pageMetadata({
  path: "/about",
  title: "About Us",
  description:
    "Kindred Tech Support offers patient, respectful, in-home technology help for seniors and families in Tuscarawas County, Ohio. Learn about our mission and values.",
});

const VALUES = [
  {
    title: "Patience",
    text: "Learning technology takes time, and that is fine. We never rush, and we are glad to explain something again, and again, if that helps.",
  },
  {
    title: "Respect",
    text: "We treat every customer as a capable adult. We do not talk down to anyone, and we never make decisions for you about your own devices or accounts.",
  },
  {
    title: "Honesty",
    text: "We tell you the price before we start, say so plainly when something is not worth fixing, and never sell you something you do not need.",
  },
  {
    title: "Privacy",
    text: "Your photos, messages, and accounts are yours. We only look at what we need to help, we ask before making changes, and we never ask for banking passwords.",
  },
  {
    title: "Clarity",
    text: "Plain language instead of jargon, and written notes you can keep, so you are more confident after every visit.",
  },
  {
    title: "Community",
    text: "We are a local service for our neighbors. We want people to stay connected to family, friends, and the services they rely on.",
  },
];

export default async function AboutPage() {
  const business = await getSettings("business");
  return (
    <>
      <PageIntro eyebrow="About us" title={business.tagline || "Modern Technology. Old-Fashioned Service."}>
        <p>
          {business.name} exists for a simple reason: technology should make life easier, not more stressful. Too many people are left on their own with a confusing
          phone, a computer full of pop-ups, or a television with three remotes. We come to you, sit down beside you, and help.
        </p>
      </PageIntro>

      <Section id="mission" title="Our mission">
        <div className="max-w-3xl space-y-4 text-lg">
          <p>
            Our mission is to help seniors and their families use technology with confidence through patient, respectful, in-person help. We want every visit to end
            with the problem solved and with you feeling more comfortable than when we started.
          </p>
          <p>
            We believe the best technology help looks a lot like old-fashioned service: showing up when we say we will, listening carefully, explaining clearly, charging
            fairly, and treating your home with respect.
          </p>
        </div>
      </Section>

      <Section id="values" title="What we value" tone="white">
        <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {VALUES.map((v) => (
            <li key={v.title} className="rounded-lg border border-line bg-soft p-6">
              <h3 className="text-xl">{v.title}</h3>
              <p className="mt-2">{v.text}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="families" title="Working with families">
        <div className="max-w-3xl space-y-4 text-lg">
          <p>
            Many of our appointments are arranged by sons, daughters, and other relatives who want to help a parent but cannot always be there. Family members can
            schedule visits and pay invoices.
          </p>
          <p>
            Paying for a visit does not automatically share private details. The customer decides which family members can schedule, pay, receive updates, or see
            service notes, and can change those choices at any time.
          </p>
          <p>
            <Link href="/faq">Read common questions from families</Link>
          </p>
        </div>
      </Section>

      <Section id="communities" title="Serving our communities" tone="white">
        <div className="max-w-3xl space-y-4 text-lg">
          <p>
            We are based in Tuscarawas County, Ohio, and we also partner with senior living communities to offer on-site Tech Help Days for residents. As we grow, we
            plan to serve neighboring Ohio counties.
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/service-areas" variant="outline">
              See Our Service Area
            </ButtonLink>
            <ButtonLink href="/senior-living" variant="outline">
              Senior Living Partnerships
            </ButtonLink>
          </div>
        </div>
      </Section>

      <CtaBand secondary={{ href: "/contact", label: "Contact Kindred" }} />
    </>
  );
}
