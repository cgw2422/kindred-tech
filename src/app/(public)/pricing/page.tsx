import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, Table, Td, Th } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { CheckList, CtaBand, PageIntro, Section } from "../_components/Blocks";
import { getActiveServiceAreas, getActiveServices, getKindredCarePlan } from "../_lib/data";
import { durationLabel, extensionLabel, servicePriceLabel, travelFeeSummary } from "../_lib/format";
import { pageMetadata } from "../_lib/seo";

export const metadata: Metadata = pageMetadata({
  path: "/pricing",
  title: "Pricing for In-Home Senior Tech Help",
  description:
    "Clear, upfront prices for in-home and remote technology help in Tuscarawas County, Ohio, the Kindred Care membership, and custom proposals for senior living community partnerships.",
});

export default async function PricingPage() {
  const [services, plan, areas, cancellation] = await Promise.all([getActiveServices(), getKindredCarePlan(), getActiveServiceAreas(), getSettings("cancellation")]);
  // Residential = services individuals and families book directly. Community = Tech Help Day services.
  const individual = services.filter((s) => s.isBookableOnline);
  const custom = services.filter((s) => !s.isBookableOnline);
  const extensions = individual.filter((s) => extensionLabel(s));

  return (
    <>
      <PageIntro
        eyebrow="Pricing"
        title="Simple, upfront pricing"
        actions={
          <ButtonLink href="/schedule" size="lg">
            Schedule a Visit
          </ButtonLink>
        }
      >
        <p>
          You will always know the price before we begin. If something will take longer than planned or cost more, we tell you and ask first. Family members are welcome
          to book and pay on a loved one&apos;s behalf.
        </p>
      </PageIntro>

      <Section id="service-pricing" title="Residential service prices" intro="For individuals and families. Book online or contact us.">
        {individual.length === 0 ? (
          <p>Our prices are being updated. Please contact us for current pricing.</p>
        ) : (
          <>
            {/* Phones and small tablets: easy-to-read cards */}
            <ul className="grid gap-4 md:hidden">
              {individual.map((s) => (
                <li key={s.id} className="rounded-lg border border-line bg-white p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-lg">{s.name}</h3>
                    <p className="font-heading text-xl font-bold whitespace-nowrap text-green-dark">{servicePriceLabel(s)}</p>
                  </div>
                  <p className="mt-1">{s.shortDescription}</p>
                  <p className="mt-2">
                    {s.isRemote ? "Remote" : "In-home"} &middot; {s.pricingType === "STARTING_AT" ? `About ${durationLabel(s.durationMinutes)}` : `Up to ${durationLabel(s.durationMinutes)}`}
                  </p>
                </li>
              ))}
            </ul>
            {/* Larger screens: table */}
            <div className="hidden md:block">
              <Table caption="Residential service prices">
                <thead>
                  <tr>
                    <Th>Service</Th>
                    <Th>Where</Th>
                    <Th>Time included</Th>
                    <Th className="text-right">Price</Th>
                  </tr>
                </thead>
                <tbody>
                  {individual.map((s) => (
                    <tr key={s.id}>
                      <Td>
                        <span className="font-semibold text-navy">{s.name}</span>
                        <span className="block">{s.shortDescription}</span>
                      </Td>
                      <Td>{s.isRemote ? "Remote" : "In-home"}</Td>
                      <Td>{s.pricingType === "STARTING_AT" ? `About ${durationLabel(s.durationMinutes)}` : `Up to ${durationLabel(s.durationMinutes)}`}</Td>
                      <Td className="text-right text-lg font-semibold whitespace-nowrap text-navy">{servicePriceLabel(s)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        )}
        <div className="mt-6 rounded-lg border-l-4 border-green bg-green-light p-5 text-navy-dark">
          <h3 className="text-lg">You approve any additional cost first</h3>
          <p className="mt-1">
            Before we do any work beyond what you booked, such as extra time or an additional task, we explain what it involves and what it costs, and we only go ahead
            with your approval.
          </p>
        </div>
        <p className="mt-4">
          &quot;Starting at&quot; prices depend on the work involved, such as how much needs to be transferred to a new computer. We confirm the final price with you before
          we start.
        </p>
        <div className="mt-6">
          <ButtonLink href="/schedule" size="lg">
            Schedule a Visit
          </ButtonLink>
        </div>
      </Section>

      {extensions.length > 0 && (
        <Section id="extra-time" title="Need more time?" tone="white" intro="If you would like to keep going at the end of a visit, you can add time. We always ask before extending.">
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {extensions.map((s) => (
              <li key={s.id} className="rounded-lg border border-line bg-soft p-5">
                <p className="font-semibold text-navy">{s.name}</p>
                <p className="mt-1">{extensionLabel(s)}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {plan && (
        <section id="membership" aria-labelledby="membership-title" className="scroll-mt-4">
          <div className="container-site py-12 md:py-16">
            <div className="grid gap-8 rounded-lg border-2 border-navy bg-white p-6 md:p-10 lg:grid-cols-[1.2fr_1fr]">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-green-dark">Membership</p>
                <h2 id="membership-title" className="mt-1 text-2xl md:text-3xl">
                  {plan.name}
                </h2>
                <p className="mt-3 text-lg">{plan.description}</p>
                <p className="mt-5">
                  <span className="font-heading text-4xl font-bold text-navy">{formatCents(plan.priceCents)}</span>{" "}
                  <span className="text-lg">per {plan.interval === "YEAR" ? "year" : "month"}</span>
                </p>
                <p className="mt-4">
                  Membership is a convenience and peace-of-mind plan. In-home visits are not unlimited; they are scheduled and billed separately
                  {plan.inHomeDiscountPercent > 0 ? ` at the member discount of ${plan.inHomeDiscountPercent}%` : ""}.
                </p>
                <p className="mt-3">To ask about membership, mention it when you schedule or send us a message.</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <ButtonLink href="/contact?topic=membership" variant="secondary">
                    Ask About Membership
                  </ButtonLink>
                </div>
              </div>
              {plan.benefitsText.length > 0 && (
                <div className="rounded-lg bg-soft p-6">
                  <h3 className="text-lg">Membership benefits</h3>
                  <div className="mt-4">
                    <CheckList items={plan.benefitsText} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <Section id="travel-fees" title="Travel fees" tone="white">
        <p className="max-w-3xl text-lg">{travelFeeSummary(areas.map((a) => a.travelFeeCents))}</p>
        {areas.some((a) => a.travelFeeCents > 0) && (
          <ul className="mt-4 space-y-1">
            {areas.map((a) => (
              <li key={a.id}>
                {a.name}: {a.travelFeeCents > 0 ? formatCents(a.travelFeeCents) : "no travel fee"}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 max-w-3xl">
          Outside our regular area? <Link href="/contact?topic=service-area">Contact Kindred</Link> and we will let you know whether we can help. Remote support has no
          travel fee.
        </p>
      </Section>

      <Section id="cancellation" title="Cancellation and rescheduling">
        <p className="max-w-3xl text-lg">{cancellation.policyText}</p>
      </Section>

      <section id="communities" aria-labelledby="communities-title" className="scroll-mt-4 border-y border-line bg-white">
        <div className="container-site py-12 md:py-16">
          <div className="max-w-3xl rounded-lg border-2 border-navy p-6 md:p-8">
            <p className="text-sm font-semibold uppercase tracking-wider text-green-dark">Separate from residential pricing</p>
            <h2 id="communities-title" className="mt-1 text-2xl md:text-3xl">
              Senior living community partnerships
            </h2>
            <p className="mt-3 text-lg">
              Recurring resident technology support programs and community support sessions are custom quoted based on how often we visit, the length of each session,
              and whether the community or residents pay. We will prepare a written proposal for your community.
            </p>
            {custom.length > 0 && (
              <ul className="mt-4 list-disc space-y-1 pl-6">
                {custom.map((s) => (
                  <li key={s.id}>
                    {s.name}: {servicePriceLabel(s)}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
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

      <CtaBand title="Questions about pricing?" secondary={{ href: "/contact", label: "Contact Kindred" }}>
        We are happy to explain what a visit might cost before you book. There is never any obligation.
      </CtaBand>
    </>
  );
}
