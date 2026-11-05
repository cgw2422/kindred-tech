import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui";
import { getSettings } from "@/lib/settings";
import { CtaBand, PageIntro, Section } from "../_components/Blocks";
import { pageMetadata } from "../_lib/seo";
import { getPageImages } from "@/lib/media/service";
import { SlotImage } from "@/components/media/SlotImage";

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

const STORY = [
  "Through my involvement at church, I've seen firsthand how frustrating everyday technology can become for older adults.",
  "Something as simple as using a smartphone, joining a video call, setting up a television, or navigating an unfamiliar app can turn into an overwhelming experience when there's nobody available to help.",
  "What stood out to me wasn't just the technology problems. It was how often people simply needed someone willing to sit down, listen, and explain things patiently without making them feel rushed or embarrassed.",
  "That experience helped shape the idea behind Kindred Tech Support.",
  "I believe everyone deserves to feel comfortable using the technology that's become part of everyday life, regardless of their age or experience.",
  "Kindred is built around that belief: providing knowledgeable, patient, and respectful technology assistance with a personal touch.",
];

export default async function AboutPage() {
  const [business, images] = await Promise.all([getSettings("business"), getPageImages(["about-owner"])]);
  // Optional real owner photo, uploaded by the owner in Admin > Website > Page Images.
  const ownerPhoto = images["about-owner"];
  const ownerParagraphs = business.ownerBio.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const tagline = business.tagline || "Modern Technology. Old-Fashioned Service.";
  return (
    <>
      <PageIntro eyebrow="About us" title={`About ${business.name}`}>
        <p>
          {business.name} exists for a simple reason: technology should make life easier, not more stressful. Too many people are left on their own with a confusing
          phone, a computer full of pop-ups, or a television with three remotes. We come to you, sit down beside you, and help.
        </p>
      </PageIntro>

      <section aria-labelledby="why-title" className="border-b border-line bg-white">
        <div className={`container-site grid gap-10 py-12 md:py-16 ${ownerPhoto ? "md:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)] md:items-start" : ""}`}>
          <div className="measure">
            <h2 id="why-title" className="text-2xl md:text-3xl">
              Why Kindred Exists
            </h2>
            <div className="mt-5 space-y-4 text-lg">
              {STORY.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
            {business.ownerName && (
              <p className="mt-6 text-lg">
                <span className="font-semibold text-navy">{business.ownerName}</span>
                {business.ownerTitle && <span>, {business.ownerTitle}</span>}
              </p>
            )}
            <p className="mt-8 border-l-4 border-green pl-4 font-heading text-xl text-navy md:text-2xl">{tagline}</p>
          </div>
          {ownerPhoto && (
            <div className="mx-auto w-full max-w-[20rem]">
              <SlotImage slotKey="about-owner" image={ownerPhoto} />
            </div>
          )}
        </div>
      </section>

      <Section id="mission" title="Our mission">
        <div className="measure space-y-4 text-lg">
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

      {ownerParagraphs.length > 0 && (
        <section aria-labelledby="owner-title" className="border-y border-line bg-white">
          <div className="container-site py-12 md:py-16">
            <div className="measure">
              <h2 id="owner-title" className="text-2xl md:text-3xl">
                {business.ownerName ? `Meet ${business.ownerName}` : "Meet the owner"}
              </h2>
              {business.ownerTitle && <p className="mt-1 text-lg font-semibold text-green-dark">{business.ownerTitle}</p>}
              <div className="mt-4 space-y-4 text-lg">
                {ownerParagraphs.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <Section id="values" title="What we value" tone={ownerParagraphs.length > 0 ? "soft" : "white"}>
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
        <div className="measure space-y-4 text-lg">
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
        <div className="measure space-y-4 text-lg">
          <p>
            We are based in Tuscarawas County, Ohio, where we provide in-home visits, and we partner with senior living and 55+ communities across East-Central and
            Northeast Ohio to offer scheduled, on-site technology support for residents.
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
