import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { CtaBand, PageIntro } from "../_components/Blocks";
import { getActiveServiceAreas } from "../_lib/data";
import { joinList } from "../_lib/format";
import { pageMetadata } from "../_lib/seo";
import { PARTNERSHIP_MARKETS, PARTNERSHIP_RADIUS_MILES, REGION_LINE } from "@/lib/community";

export const metadata: Metadata = pageMetadata({
  path: "/service-areas",
  title: "Service Areas: Tuscarawas County and East-Central Ohio",
  description:
    "In-home technology help for seniors in Tuscarawas County, Ohio, and senior living community partnerships across East-Central and Northeast Ohio, including Canton, Akron, Cambridge, Zanesville, Wooster, and Coshocton.",
});

function stateName(code: string) {
  return code === "OH" ? "Ohio" : code;
}

export default async function ServiceAreasPage() {
  const areas = await getActiveServiceAreas();
  const counties = areas.map((a) => `${a.county} County`);

  return (
    <>
      <PageIntro
        eyebrow={`Service areas · ${REGION_LINE}`}
        title="Where we provide help"
        actions={
          <ButtonLink href="/schedule" size="lg">
            Schedule a Visit
          </ButtonLink>
        }
      >
        <p>
          Kindred is based in Tuscarawas County. We provide in-home visits throughout {counties.length ? joinList(counties) : "Tuscarawas County"}, Ohio, and partner
          with senior living communities across East-Central and Northeast Ohio. Remote support by phone or secure screen sharing is available wherever you are.
        </p>
      </PageIntro>

      <div className="container-site py-12 md:py-16">
        <h2 className="mb-2 text-2xl md:text-3xl">In-home visits for individuals and families</h2>
        <p className="mb-8 max-w-3xl text-lg">Our residential in-home service area is listed below. If you are unsure whether we can reach your address, just ask.</p>
        {areas.length === 0 ? (
          <p className="text-lg">
            Our service area list is being updated. Please <Link href="/contact">contact us</Link> to ask whether we serve your address.
          </p>
        ) : (
          <div className="space-y-10">
            {areas.map((a) => {
              const headingId = `area-${a.id}`;
              return (
                <section key={a.id} aria-labelledby={headingId} className="rounded-lg border border-line bg-white p-6 md:p-8">
                  <h3 id={headingId} className="text-2xl">
                    {a.county} County, {stateName(a.state)}
                  </h3>
                  <p className="mt-3">
                    {a.travelFeeCents > 0 ? `A travel fee of ${formatCents(a.travelFeeCents)} applies to in-home visits in this area.` : "No travel fee for in-home visits in this area."}
                  </p>
                  {a.communities.length > 0 && (
                    <>
                      <h4 className="mt-6 font-heading text-xl font-bold text-navy">Communities we serve</h4>
                      <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                        {a.communities.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {a.postalCodes.length > 0 && (
                    <>
                      <h4 className="mt-6 font-heading text-xl font-bold text-navy">ZIP codes</h4>
                      <p className="mt-3 break-words">{[...a.postalCodes].sort().join(", ")}</p>
                      <p className="mt-2 text-sm">Some ZIP codes cross county lines. If you are unsure whether we can reach your address, just ask.</p>
                    </>
                  )}
                </section>
              );
            })}
          </div>
        )}

        <section aria-labelledby="partnership-territory" className="mt-12 rounded-lg border-2 border-navy bg-white p-6 md:p-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-green-dark">For senior living and 55+ communities</p>
          <h2 id="partnership-territory" className="mt-1 text-2xl md:text-3xl">
            Community partnership territory
          </h2>
          <p className="mt-3 max-w-3xl text-lg">
            We offer resident technology support programs to senior living and 55+ communities within approximately {PARTNERSHIP_RADIUS_MILES} miles of Gnadenhutten,
            Ohio. Major markets include:
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PARTNERSHIP_MARKETS.map((m) => (
              <li key={m}>{m}</li>
            ))}
            <li>Other qualifying communities within our service territory</li>
          </ul>
          <p className="mt-5 max-w-3xl">
            This territory applies to community partnerships. We confirm availability for each community before preparing a proposal, and it does not expand our
            residential in-home service area.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/senior-living#inquiry" variant="secondary">
              Request a Partnership Proposal
            </ButtonLink>
            <ButtonLink href="/senior-living" variant="outline">
              Explore Community Partnerships
            </ButtonLink>
          </div>
        </section>

        <section aria-labelledby="outside-area" className="mt-12 max-w-3xl rounded-lg border border-line bg-white p-6">
          <h2 id="outside-area" className="text-xl md:text-2xl">
            Outside our in-home area?
          </h2>
          <p className="mt-2">Tell us where you are and what you need. We will let you know honestly whether we can help, and remote help is available anywhere.</p>
          <p className="mt-4">
            <ButtonLink href="/contact?topic=service-area" variant="outline">
              Contact Kindred
            </ButtonLink>
          </p>
        </section>
      </div>

      <CtaBand />
    </>
  );
}
