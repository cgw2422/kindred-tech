import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { PageIntro } from "../_components/Blocks";
import { telHref } from "../_lib/format";
import { pageMetadata } from "../_lib/seo";
import { CallButton } from "@/components/site/CallButton";
import { ContactForm } from "./ContactForm";
import { CONTACT_TOPICS } from "./schema";

export const metadata: Metadata = pageMetadata({
  path: "/contact",
  title: "Contact Kindred",
  description: "Questions about senior technology help, pricing, arranging a visit for a parent, or a community partnership? Contact Kindred Tech Support in Ohio.",
});

type Props = { searchParams: Promise<{ topic?: string | string[] }> };

export default async function ContactPage({ searchParams }: Props) {
  const [business, sp] = await Promise.all([getSettings("business"), searchParams]);
  const topicParam = typeof sp.topic === "string" ? sp.topic : "";
  const defaultTopic = CONTACT_TOPICS.some((t) => t.value === topicParam) ? topicParam : "";
  const showAddress = business.showAddressPublicly && business.addressLine;

  return (
    <>
      <PageIntro eyebrow="Contact" title="We are happy to help">
        <p>Have a question before booking, or want to talk through what a parent needs? Send us a message and a real person will get back to you.</p>
      </PageIntro>

      <div className="container-site grid gap-10 py-12 md:py-16 lg:grid-cols-[1fr_1.5fr]">
        <section aria-labelledby="contact-details">
          <h2 id="contact-details" className="text-2xl">
            Contact details
          </h2>
          <dl className="mt-5 space-y-4 text-lg">
            {business.phone && (
              <div>
                <dt className="font-semibold text-navy">Phone</dt>
                <dd>
                  <a href={telHref(business.phone)}>{business.phone}</a>
                </dd>
              </div>
            )}
            {business.email && (
              <div>
                <dt className="font-semibold text-navy">Email</dt>
                <dd>
                  <a href={`mailto:${business.email}`} className="break-all">
                    {business.email}
                  </a>
                </dd>
              </div>
            )}
            {showAddress && (
              <div>
                <dt className="font-semibold text-navy">Address</dt>
                <dd>
                  {business.addressLine}
                  <br />
                  {business.city}, {business.state} {business.postalCode}
                </dd>
              </div>
            )}
            {business.hoursDescription && (
              <div>
                <dt className="font-semibold text-navy">Hours</dt>
                <dd>{business.hoursDescription}</dd>
              </div>
            )}
          </dl>
          <div className="mt-8 rounded-lg border border-line bg-white p-5">
            <h3 className="text-lg">Ready to book?</h3>
            <p className="mt-2">
              You can <Link href="/schedule">schedule a visit online</Link>. Senior living communities can <Link href="/senior-living#inquiry">request a partnership proposal</Link>.
            </p>
            {business.phone && (
              <div className="mt-4">
                <CallButton phone={business.phone} size="md" />
              </div>
            )}
          </div>
          <div className="mt-6 rounded-lg border border-line bg-white p-5">
            <h3 className="text-lg">A note about your safety</h3>
            <p className="mt-2">We will never ask for your online banking password, PIN, or full card number by email, text, or phone.</p>
          </div>
        </section>

        <section aria-labelledby="contact-form-title" className="rounded-lg border border-line bg-white p-6 md:p-8">
          <h2 id="contact-form-title" className="mb-4 text-2xl">
            Send us a message
          </h2>
          <ContactForm defaultTopic={defaultTopic} />
        </section>
      </div>
    </>
  );
}
