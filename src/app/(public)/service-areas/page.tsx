import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { CtaBand, PageIntro } from "../_components/Blocks";
import { getActiveServiceAreas } from "../_lib/data";
import { joinList } from "../_lib/format";
import { pageMetadata } from "../_lib/seo";

export const metadata: Metadata = pageMetadata({
  path: "/service-areas",
  title: "Service Areas in Ohio",
  description:
    "Kindred Tech Support provides in-home technology help in Tuscarawas County, Ohio, including New Philadelphia, Dover, Uhrichsville, Dennison, Sugarcreek, and nearby communities.",
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
        eyebrow="Service areas"
        title="Where we provide in-home help"
        actions={
          <ButtonLink href="/schedule" size="lg">
            Schedule a Visit
          </ButtonLink>
        }
      >
        <p>
          We currently visit homes and senior living communities throughout {counties.length ? joinList(counties) : "Tuscarawas County"}, Ohio. Remote support by phone
          or secure screen sharing is available wherever you are.
        </p>
      </PageIntro>

      <div className="container-site py-12 md:py-16">
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
                  <h2 id={headingId} className="text-2xl md:text-3xl">
                    {a.county} County, {stateName(a.state)}
                  </h2>
                  <p className="mt-3">
                    {a.travelFeeCents > 0 ? `A travel fee of ${formatCents(a.travelFeeCents)} applies to in-home visits in this area.` : "No travel fee for in-home visits in this area."}
                  </p>
                  {a.communities.length > 0 && (
                    <>
                      <h3 className="mt-6 text-xl">Communities we serve</h3>
                      <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                        {a.communities.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {a.postalCodes.length > 0 && (
                    <>
                      <h3 className="mt-6 text-xl">ZIP codes</h3>
                      <p className="mt-3 break-words">{[...a.postalCodes].sort().join(", ")}</p>
                      <p className="mt-2 text-sm">Some ZIP codes cross county lines. If you are unsure whether we can reach your address, just ask.</p>
                    </>
                  )}
                </section>
              );
            })}
          </div>
        )}

        <section aria-labelledby="expansion" className="mt-12 grid gap-8 md:grid-cols-2">
          <div>
            <h2 id="expansion" className="text-2xl">
              Growing to more of Ohio
            </h2>
            <p className="mt-3 text-lg">
              We plan to expand in-home service to neighboring Ohio counties as we grow. If you live just outside our current area, please still get in touch. We may be
              able to schedule a visit, and remote help is available anywhere.
            </p>
          </div>
          <div className="rounded-lg border border-line bg-white p-6">
            <h2 className="text-xl">Outside our area?</h2>
            <p className="mt-2">Tell us where you are and what you need. We will let you know honestly whether we can help.</p>
            <p className="mt-4">
              <ButtonLink href="/contact?topic=service-area" variant="secondary">
                Ask About Your Location
              </ButtonLink>
            </p>
          </div>
        </section>
      </div>

      <CtaBand />
    </>
  );
}
