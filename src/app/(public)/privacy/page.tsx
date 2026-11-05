import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { ContactLines, LegalPage } from "../_components/LegalPage";
import { pageMetadata } from "../_lib/seo";

export const metadata: Metadata = pageMetadata({
  path: "/privacy",
  title: "Privacy Policy",
  description: "How Kindred Tech Support collects, uses, shares, and protects personal information, including family contact permissions and marketing preferences.",
});

function years(days: number) {
  const y = Math.round((days / 365) * 10) / 10;
  return y >= 1 ? `${y} year${y === 1 ? "" : "s"}` : `${days} days`;
}

export default async function PrivacyPage() {
  const [business, privacy] = await Promise.all([getSettings("business"), getSettings("privacy")]);
  const name = business.name;
  return (
    <LegalPage title="Privacy Policy" template>
      <p>
        This policy explains what personal information {name} (&quot;we&quot;, &quot;us&quot;) collects, how we use it, who we share it with, and the choices you have.
        We have tried to write it in plain language. If anything is unclear, please contact us.
      </p>

      <h2>Information we collect</h2>
      <p>We collect only what we need to schedule, provide, and bill for our services:</p>
      <ul>
        <li>
          <strong>Contact details</strong> such as your name, phone number, email address, and the address where you would like us to visit.
        </li>
        <li>
          <strong>Appointment details</strong> such as the service you requested, a description of the problem, the devices involved, and notes about what we did.
        </li>
        <li>
          <strong>Family and authorized contacts</strong> you choose to add, and the permissions you give them.
        </li>
        <li>
          <strong>Billing records</strong> such as invoices, amounts paid, and payment status.
        </li>
        <li>
          <strong>Consent records</strong> such as your authorization for remote support or subscription changes and your marketing email preference.
        </li>
        <li>
          <strong>Website information</strong> such as messages you send through our forms, and basic technical information like your IP address, which we use to prevent
          spam and abuse and to keep accounts secure.
        </li>
      </ul>

      <h2>Information we do not collect</h2>
      <ul>
        <li>
          <strong>Card numbers.</strong> Card payments are processed by our payment processor, Stripe. We never see or store your full card number.
        </li>
        <li>
          <strong>Banking passwords.</strong> We never ask for your online banking password or PIN, and we do not access your financial accounts.
        </li>
        <li>
          <strong>Unnecessary medical information.</strong> We do not ask for medical history or diagnoses. If something health-related helps us serve you, such as a
          preference for larger text or a hearing aid you would like connected to your phone, we record only what is needed for that purpose. Please do not send us
          medical details through our forms.
        </li>
      </ul>

      <h2>How we use your information</h2>
      <ul>
        <li>To schedule and confirm appointments, plan travel, and provide the service you requested</li>
        <li>To send appointment confirmations, reminders, invoices, receipts, and other messages about your service</li>
        <li>To keep records of the work performed and the permissions you have given</li>
        <li>To respond to your questions and requests</li>
        <li>To protect our customers, staff, and website from fraud, spam, and misuse</li>
        <li>To send occasional marketing emails, only if you have agreed to receive them</li>
      </ul>
      <p>We do not sell your personal information.</p>

      <h2>Family members and authorized contacts</h2>
      <p>
        Many customers ask a family member to help arrange or pay for our services. You decide what each family contact may do. A family contact may be allowed to
        schedule appointments, pay invoices, receive appointment updates, or view service details, and each permission is separate. Paying for a service does not, by
        itself, give a family member access to your private details. You can change or remove these permissions at any time by contacting us.
      </p>

      <h2>Senior living communities</h2>
      <p>
        If we serve you through a partnership with your senior living community, community staff do not automatically see your private records. We share scheduling
        information needed to coordinate visits, and share other details only with your permission.
      </p>

      <h2>Who we share information with</h2>
      <p>We share personal information only with service providers who help us run our business, and only as needed for them to do so:</p>
      <ul>
        <li>
          <strong>Payment processor (Stripe)</strong> to process card payments securely.
        </li>
        <li>
          <strong>Email delivery provider</strong> to send appointment, billing, and other emails on our behalf.
        </li>
        <li>
          <strong>Hosting, database, and mapping providers</strong> that store our records and help plan travel to appointments.
        </li>
      </ul>
      <p>
        We may also disclose information if required by law, or to protect the safety of a customer or another person.
      </p>

      <h2>Marketing emails and how to unsubscribe</h2>
      <p>
        We send marketing emails, such as occasional tips or news about our services, only if you have opted in. Every marketing email includes an unsubscribe link,
        and you can also ask us to stop at any time. Unsubscribing does not stop transactional messages that you need, such as appointment confirmations, reminders,
        and invoices.
      </p>

      <h2>How long we keep information</h2>
      <p>
        We keep customer, appointment, and billing records for as long as you are a customer and for a reasonable period afterward to meet tax, accounting, and legal
        obligations. Records of emails and messages we send are generally kept for about {years(privacy.communicationRetentionDays)}, and security and audit logs for
        about {years(privacy.auditRetentionDays)}. Messages sent through our website forms are deleted when they are no longer needed. You may ask us to delete your
        information, subject to records we are required to keep.
      </p>

      <h2>How we protect information</h2>
      <p>
        We use reasonable safeguards, including encrypted connections, access controls so staff see only what they need for their role, and logs of sensitive
        actions. No system is perfectly secure, so please let us know right away if you believe your information has been misused.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Ask to see, correct, or delete the personal information we hold about you</li>
        <li>Change which family members can schedule, pay, receive updates, or view service details</li>
        <li>
          Opt out of marketing emails using the unsubscribe link or by <Link href="/contact">contacting us</Link>
        </li>
        <li>Withdraw a consent you have given, such as permission for remote support, for future appointments</li>
      </ul>

      <h2>Children</h2>
      <p>Our services are intended for adults. We do not knowingly collect information from children under 13 through our website.</p>

      <h2>Changes to this policy</h2>
      <p>If we make important changes, we will update this page and, where appropriate, let customers know.</p>

      <h2>Contact us</h2>
      <p>Questions or requests about your privacy can be sent to us:</p>
      <ContactLines business={business} />
    </LegalPage>
  );
}
