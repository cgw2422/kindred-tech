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
  title: "Pricing",
  description:
    "Clear, upfront prices for in-home and remote technology help, the Kindred Care membership, travel fees, cancellation policy, and custom pricing for senior living communities.",
});

export default async function PricingPage() {
  const [services, plan, areas, cancellation] = await Promise.all([getActiveServices(), getKindredCarePlan(), getActiveServiceAreas(), getSettings("cancellation")]);
  const individual = services.filter((s) => s.pricingType !== "CUSTOM_QUOTE");
  const custom = services.filter((s) => s.pricingType === "CUSTOM_QUOTE");
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

      <Section id="service-pricing" title="Service prices">
        {individual.length === 0 ? (
          <p>Our prices are being updated. Please contact us for current pricing.</p>
        ) : (
          <Table caption="Service prices">
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
                    <span className="block text-sm">{s.shortDescription}</span>
                  </Td>
                  <Td>{s.isRemote ? "Remote" : s.isBookableOnline ? "In-home" : "At your community"}</Td>
                  <Td>{s.pricingType === "STARTING_AT" ? `About ${durationLabel(s.durationMinutes)}` : `Up to ${durationLabel(s.durationMinutes)}`}</Td>
                  <Td className="text-right font-semibold whitespace-nowrap text-navy">{servicePriceLabel(s)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="mt-4 text-sm">
          &quot;Starting at&quot; prices depend on the work involved, such as how much needs to be transferred to a new computer. We confirm the final price with you before
          we start.
        </p>
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
          Outside our regular area? <Link href="/contact">Contact us</Link> and we will let you know whether we can help and whether a travel fee would apply. Remote
          support has no travel fee.
        </p>
      </Section>

      <Section id="cancellation" title="Cancellation and rescheduling">
        <p className="max-w-3xl text-lg">{cancellation.policyText}</p>
      </Section>

      <Section id="communities" title="Pricing for senior living communities" tone="white">
        <div className="max-w-3xl">
          <p className="text-lg">
            Tech Help Days and recurring facility contracts are priced individually based on hours on site, how often we visit, and whether residents or the community
            pay.
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
          <p className="mt-5">
            <Link href="/senior-living" className="font-semibold">
              Learn about community partnerships and request a proposal
            </Link>
          </p>
        </div>
      </Section>

      <CtaBand title="Questions about pricing?" secondary={{ href: "/contact", label: "Contact Us" }}>
        We are happy to explain what a visit might cost before you book. There is never any obligation.
      </CtaBand>
    </>
  );
}
