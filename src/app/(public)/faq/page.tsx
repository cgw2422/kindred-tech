import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand, FaqList, PageIntro } from "../_components/Blocks";
import { JsonLd } from "../_components/JsonLd";
import { faqJsonLd, pageMetadata } from "../_lib/seo";
import { ALL_FAQS, FAQ_GROUPS } from "./faqs";

export const metadata: Metadata = pageMetadata({
  path: "/faq",
  title: "Frequently Asked Questions",
  description:
    "Answers about in-home technology help, pricing, family booking, privacy, remote support, and senior living partnerships from Kindred Tech Support in Tuscarawas County, Ohio.",
});

export default function FaqPage() {
  return (
    <>
      <JsonLd data={faqJsonLd(ALL_FAQS)} />
      <PageIntro eyebrow="FAQ" title="Frequently asked questions">
        <p>
          Straight answers to the questions we hear most. If you do not see yours, <Link href="/contact">send us a message</Link>.
        </p>
      </PageIntro>

      <div className="container-site py-12 md:py-16">
        <nav aria-label="FAQ topics" className="mb-10">
          <ul className="flex flex-wrap gap-3">
            {FAQ_GROUPS.map((g) => (
              <li key={g.id}>
                <a href={`#${g.id}`} className="inline-flex min-h-[44px] items-center rounded-full border border-line bg-white px-4 font-semibold no-underline hover:border-navy hover:underline">
                  {g.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="max-w-3xl space-y-12">
          {FAQ_GROUPS.map((g) => (
            <section key={g.id} id={g.id} aria-labelledby={`${g.id}-title`} className="scroll-mt-4">
              <h2 id={`${g.id}-title`} className="mb-5 text-2xl md:text-3xl">
                {g.title}
              </h2>
              <FaqList items={g.items} />
            </section>
          ))}
        </div>
      </div>

      <CtaBand title="Still have a question?" secondary={{ href: "/contact", label: "Contact Us" }}>
        We are glad to talk it through before you book. There is no obligation.
      </CtaBand>
    </>
  );
}
