import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { ContactLines, LegalPage } from "../_components/LegalPage";
import { pageMetadata } from "../_lib/seo";

export const metadata: Metadata = pageMetadata({
  path: "/terms",
  title: "Terms of Service",
  description: "The terms that apply to appointments, payments, cancellations, remote support, and use of the Kindred Tech Support website.",
});

export default async function TermsPage() {
  const [business, cancellation] = await Promise.all([getSettings("business"), getSettings("cancellation")]);
  const name = business.name;
  return (
    <LegalPage title="Terms of Service" template>
      <p>
        These terms apply when you use our website or schedule services with {name} (&quot;we&quot;, &quot;us&quot;). By booking an appointment or using our website,
        you agree to these terms. Please read them, and ask us if you have any questions.
      </p>

      <h2>Our services</h2>
      <p>
        We provide technology help, instruction, and setup assistance for personal devices and home technology, in person and remotely. We do not sell equipment, and we
        do not perform hardware repairs such as replacing screens or internal components unless we agree otherwise in writing.
      </p>

      <h2>Appointments</h2>
      <ul>
        <li>An appointment request is not confirmed until we confirm it with you.</li>
        <li>Please make sure an adult who owns or is authorized to use the devices is present for in-home visits.</li>
        <li>We may decline or end a visit if we feel unsafe or if we are asked to do something unlawful or that could harm you or someone else.</li>
        <li>If someone books on your behalf, such as a family member, we will still confirm with you before making changes to your devices or accounts.</li>
      </ul>

      <h2>Prices and payment</h2>
      <ul>
        <li>Current prices are listed on our <Link href="/pricing">pricing page</Link> and confirmed before your appointment.</li>
        <li>We will ask before adding time or anything else that changes the price.</li>
        <li>
          Payment is due as stated on your invoice. Card payments are processed by Stripe; we do not store full card numbers. A family member may pay on your behalf if
          you permit it.
        </li>
        <li>Membership plans renew automatically until canceled. Membership benefits are described on our pricing page, and in-home visits are not unlimited.</li>
      </ul>

      <h2>Cancellations and rescheduling</h2>
      <p>{cancellation.policyText}</p>

      <h2>Your authorization and your accounts</h2>
      <ul>
        <li>
          You remain in control of your devices and accounts. We make changes, purchases, cancellations, or sign-ups only with your authorization.
        </li>
        <li>You type your own passwords. We never ask for online banking passwords and do not access your financial accounts.</li>
        <li>Remote support takes place only during a scheduled session and only after you give permission. You can end a remote session at any time.</li>
        <li>
          Subscription reviews are informational. Any savings depend on your choices and on providers&apos; terms, and are not guaranteed.
        </li>
      </ul>

      <h2>Your data and backups</h2>
      <p>
        Technology work carries some risk. Where practical, we recommend and can help you create a backup before significant changes. We are not responsible for loss of
        data that was not backed up, except where caused by our negligence.
      </p>

      <h2>Third-party products and services</h2>
      <p>
        We help you use products and services from other companies, such as device makers, internet providers, and streaming services. Those companies are responsible
        for their own products, prices, and terms.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the extent permitted by law, our total liability for any claim related to our services is limited to the amount you paid for the service involved. Nothing
        in these terms limits rights you have under applicable consumer protection law.
      </p>

      <h2>Website use</h2>
      <p>
        Please do not misuse our website, attempt to access accounts that are not yours, or submit false information. Content on this website is general information
        and may change.
      </p>

      <h2>Governing law</h2>
      <p>These terms are governed by the laws of the State of Ohio.</p>

      <h2>Changes to these terms</h2>
      <p>We may update these terms from time to time. The version on this page applies to appointments booked after it is posted.</p>

      <h2>Contact us</h2>
      <ContactLines business={business} />
    </LegalPage>
  );
}
