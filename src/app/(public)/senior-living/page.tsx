import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui";
import { getSettings } from "@/lib/settings";
import { CheckList, PageIntro, Section } from "../_components/Blocks";
import { telHref } from "../_lib/format";
import { pageMetadata } from "../_lib/seo";
import { InquiryForm } from "./InquiryForm";

export const metadata: Metadata = pageMetadata({
  path: "/senior-living",
  title: "Senior Living Community Technology Partnerships",
  description:
    "On-site Tech Help Days and partnership options for independent living, assisted living, and senior apartment communities in Tuscarawas County, Ohio. Resident privacy built in.",
});

const MODELS = [
  {
    title: "Resident Referral Partner",
    who: "Best for communities that want a trusted name to recommend.",
    text: "Share our information with residents and families. Residents book and pay for in-home visits on their own, and we visit their apartment or home. There is no cost to the community.",
  },
  {
    title: "Resident-Paid Tech Help Day",
    who: "Best for communities with a common room and interested residents.",
    text: "We set up on-site for a scheduled block of time. Residents sign up for one-on-one sessions and pay for their own session. The community provides the space and helps spread the word.",
  },
  {
    title: "Facility-Sponsored Tech Help Day",
    who: "Best for communities that want to offer technology help as an amenity.",
    text: "The community covers the cost of the Tech Help Day so residents can attend at no charge. It works well as part of an activities calendar, a family event, or a new-resident welcome.",
  },
  {
    title: "Recurring Facility Contract",
    who: "Best for communities that want dependable, ongoing support.",
    text: "A regular schedule, such as monthly or twice a month, with consistent faces residents get to know. We agree on the schedule, scope, and pricing in writing in advance.",
  },
];

const DAY_STEPS = [
  { title: "Plan together", text: "We agree on a date, a quiet room with a table and Wi-Fi, and how residents will sign up." },
  { title: "Residents sign up", text: "Residents reserve a session time. Walk-ins are welcome when there is room in the schedule." },
  { title: "One-on-one sessions", text: "Each resident meets with us privately to work on their own phone, tablet, laptop, or e-reader." },
  { title: "Notes to take home", text: "Residents can leave with written steps for what we covered, in large, readable print." },
];

export default async function SeniorLivingPage() {
  const business = await getSettings("business");
  return (
    <>
      <PageIntro
        eyebrow="Senior living partnerships"
        title="Technology help your residents will look forward to"
        actions={
          <>
            <ButtonLink href="#inquiry" size="lg">
              Start a Conversation
            </ButtonLink>
            <ButtonLink href="#models" variant="outline" size="lg">
              Compare Partnership Options
            </ButtonLink>
          </>
        }
      >
        <p>
          Residents want to video chat with grandchildren, use patient portals, read on a tablet, and stay safe from scams. Staff rarely have the time to sit with each
          person. We bring patient, one-on-one technology help directly to your community.
        </p>
      </PageIntro>

      <Section id="models" title="Four ways to partner" intro="Every community is different. Choose the arrangement that fits your residents, budget, and calendar. You can start small and change later.">
        <ul className="grid gap-6 md:grid-cols-2">
          {MODELS.map((m, i) => (
            <li key={m.title} className="flex flex-col rounded-lg border border-line bg-white p-6">
              <p className="text-sm font-semibold uppercase tracking-wider text-green-dark">Option {i + 1}</p>
              <h3 className="mt-1 text-xl">{m.title}</h3>
              <p className="mt-2 font-semibold text-navy">{m.who}</p>
              <p className="mt-2">{m.text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6">
          Pricing for community partnerships is custom and based on the number of hours, how often we visit, and who pays.{" "}
          <Link href="/pricing#communities">Read about community pricing</Link>.
        </p>
      </Section>

      <Section id="tech-help-day" title="What a Tech Help Day looks like" tone="white">
        <ol className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {DAY_STEPS.map((s, i) => (
            <li key={s.title} className="rounded-lg border border-line bg-soft p-5">
              <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-full bg-navy font-heading text-lg font-bold text-white">
                {i + 1}
              </span>
              <h3 className="mt-3 text-lg">
                <span className="sr-only">Step {i + 1}: </span>
                {s.title}
              </h3>
              <p className="mt-2">{s.text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="text-xl">Common topics residents bring</h3>
            <div className="mt-4">
              <CheckList
                items={[
                  "Video calls with family on FaceTime, Zoom, or WhatsApp",
                  "Making text bigger and sound clearer",
                  "Photos: viewing, sharing, and freeing up space",
                  "Email, passwords, and account sign-ins",
                  "Recognizing scam calls, texts, and pop-ups",
                  "Patient portals and pharmacy apps",
                  "E-readers, audiobooks, and streaming",
                ]}
              />
            </div>
          </div>
          <div>
            <h3 className="text-xl">What we ask of the community</h3>
            <div className="mt-4">
              <CheckList
                items={[
                  "A quiet room or corner with a table, chairs, and an electrical outlet",
                  "Access to guest Wi-Fi",
                  "Help announcing the date through your newsletter, calendar, or front desk",
                  "A staff contact for scheduling on the day",
                ]}
              />
            </div>
          </div>
        </div>
      </Section>

      <Section id="privacy" title="Resident privacy comes first">
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-lg border border-line bg-white p-6">
            <h3 className="text-lg">Private sessions</h3>
            <p className="mt-2">Each resident works with us one-on-one. What a resident shows us on their device stays between them and us.</p>
          </div>
          <div className="rounded-lg border border-line bg-white p-6">
            <h3 className="text-lg">Staff see only what they need</h3>
            <p className="mt-2">
              Facility staff do not automatically see residents&apos; private records. Your community contact can coordinate the schedule, but the details of a
              resident&apos;s session are shared only with that resident&apos;s permission.
            </p>
          </div>
          <div className="rounded-lg border border-line bg-white p-6">
            <h3 className="text-lg">Residents decide</h3>
            <p className="mt-2">
              Residents choose whether family members or staff may receive updates. We never ask for banking passwords and never make changes to accounts without the
              resident&apos;s permission.
            </p>
          </div>
        </div>
      </Section>

      <section aria-labelledby="inquiry-title" id="inquiry" className="scroll-mt-4 border-t border-line bg-white">
        <div className="container-site grid gap-10 py-12 md:py-16 lg:grid-cols-[1fr_1.5fr]">
          <div>
            <h2 id="inquiry-title" className="text-2xl md:text-3xl">
              Tell us about your community
            </h2>
            <p className="mt-4 text-lg">
              Share a few details and we will contact you within two business days to talk about your residents and which option might fit. There is no obligation.
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
          <div className="rounded-lg border border-line bg-soft p-6 md:p-8">
            <InquiryForm />
          </div>
        </div>
      </section>
    </>
  );
}
