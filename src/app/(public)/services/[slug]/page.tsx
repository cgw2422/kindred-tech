import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { CheckList, CtaBand, FaqList, PageIntro, Section } from "../../_components/Blocks";
import { JsonLd } from "../../_components/JsonLd";
import { durationLabel, extensionLabel, servicePriceLabel } from "../../_lib/format";
import { pageMetadata, serviceJsonLd } from "../../_lib/seo";
import { getServicePage, SERVICE_PAGES } from "../content";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getServicePage(slug);
  if (!page) return { title: "Service Not Found", robots: { index: false } };
  return pageMetadata({ path: `/services/${page.slug}`, title: page.metaTitle, description: page.metaDescription });
}

export default async function ServiceDetailPage({ params }: Props) {
  const { slug } = await params;
  const page = getServicePage(slug);
  if (!page) notFound();

  const [rows, business] = await Promise.all([
    prisma.service.findMany({ where: { slug: { in: page.relatedServiceSlugs }, isActive: true } }),
    getSettings("business"),
  ]);
  // Keep the order defined in the content file.
  const related = page.relatedServiceSlugs.map((s) => rows.find((r) => r.slug === s)).filter((r): r is (typeof rows)[number] => Boolean(r));
  const scheduleHref = page.scheduleServiceSlug && related.some((r) => r.slug === page.scheduleServiceSlug && r.isBookableOnline) ? `/schedule?service=${page.scheduleServiceSlug}` : "/schedule";
  const others = SERVICE_PAGES.filter((p) => p.slug !== page.slug);

  return (
    <>
      <JsonLd data={serviceJsonLd({ name: page.name, description: page.metaDescription, path: `/services/${page.slug}`, providerName: business.name })} />
      <nav aria-label="Breadcrumb" className="border-b border-line bg-white">
        <ol className="container-site flex flex-wrap gap-2 py-3 text-sm">
          <li>
            <Link href="/">Home</Link> <span aria-hidden="true">/</span>
          </li>
          <li>
            <Link href="/services">Services</Link> <span aria-hidden="true">/</span>
          </li>
          <li aria-current="page" className="text-body">
            {page.name}
          </li>
        </ol>
      </nav>

      <PageIntro
        eyebrow={page.name}
        title={page.title}
        actions={
          <>
            <ButtonLink href={scheduleHref} size="lg">
              Schedule a Visit
            </ButtonLink>
            <ButtonLink href="/contact" variant="outline" size="lg">
              Contact Kindred
            </ButtonLink>
          </>
        }
      >
        {page.intro.map((p) => (
          <p key={p} className="mb-3 last:mb-0">
            {p}
          </p>
        ))}
      </PageIntro>

      <div className="container-site grid gap-10 py-12 md:py-16 lg:grid-cols-[1fr_340px]">
        <div>
          <section aria-labelledby="help-with">
            <h2 id="help-with" className="text-2xl md:text-3xl">
              What we help with
            </h2>
            <div className="mt-6">
              <CheckList items={page.helpWith} />
            </div>
          </section>

          {page.commitments && (
            <section aria-labelledby="commitments" className="mt-10 rounded-lg border-2 border-green bg-green-light p-6">
              <h2 id="commitments" className="text-xl md:text-2xl">
                {page.commitments.title}
              </h2>
              <ul className="mt-4 list-disc space-y-2 pl-6 text-navy-dark">
                {page.commitments.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="what-to-expect" className="mt-12">
            <h2 id="what-to-expect" className="text-2xl md:text-3xl">
              What to expect
            </h2>
            <ol className="mt-6 grid gap-5 md:grid-cols-3">
              {page.whatToExpect.map((step, i) => (
                <li key={step.title} className="rounded-lg border border-line bg-white p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-navy font-heading text-lg font-bold text-white" aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3 className="mt-3 text-lg">
                    <span className="sr-only">Step {i + 1}: </span>
                    {step.title}
                  </h3>
                  <p className="mt-2">{step.text}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside aria-labelledby="pricing-heading" className="self-start rounded-lg border border-line bg-white p-6 lg:sticky lg:top-6">
          <h2 id="pricing-heading" className="text-xl">
            Pricing
          </h2>
          {related.length === 0 ? (
            <p className="mt-3">Please contact us for current pricing for this service.</p>
          ) : (
            <ul className="mt-4 space-y-5">
              {related.map((s) => {
                const ext = extensionLabel(s);
                return (
                  <li key={s.id} className="border-b border-line pb-4 last:border-0 last:pb-0">
                    <p className="font-semibold text-navy">{s.name}</p>
                    <p className="font-heading text-2xl font-bold text-green-dark">{servicePriceLabel(s)}</p>
                    <p className="text-sm">
                      {s.isRemote ? "Remote" : "In-home"} &middot; {durationLabel(s.durationMinutes)}
                    </p>
                    {ext && <p className="text-sm">{ext}</p>}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-5 text-sm">Your price is confirmed before work begins. Family members can book and pay on your behalf.</p>
          <p className="mt-3">
            <Link href="/pricing" className="font-semibold">
              View all pricing and membership options
            </Link>
          </p>
        </aside>
      </div>

      <Section id="service-faq" title="Common questions" tone="white">
        <div className="measure">
          <FaqList items={page.faqs} />
          <p className="mt-6">
            <Link href="/faq" className="font-semibold">
              Read more frequently asked questions
            </Link>
          </p>
        </div>
      </Section>

      <Section id="other-services" title="Other ways we can help">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((o) => (
            <li key={o.slug}>
              <Link href={`/services/${o.slug}`} className="flex min-h-[44px] items-center rounded-md border border-line bg-white px-4 py-3 font-semibold no-underline hover:border-navy hover:underline">
                {o.name}
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <section aria-labelledby="communities-note" className="border-t border-line bg-white">
        <div className="container-site flex flex-col gap-4 py-10 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <h2 id="communities-note" className="text-xl md:text-2xl">
              Senior living or 55+ community?
            </h2>
            <p className="mt-2">We provide scheduled, on-site technology support for residents through custom community partnerships.</p>
          </div>
          <ButtonLink href="/senior-living" variant="outline">
            Explore Community Partnerships
          </ButtonLink>
        </div>
      </section>

      <CtaBand scheduleHref={scheduleHref} secondary={{ href: "/services", label: "All Services" }} />
    </>
  );
}
