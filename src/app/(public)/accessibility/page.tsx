import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { ContactLines, LegalPage } from "../_components/LegalPage";
import { pageMetadata } from "../_lib/seo";

export const metadata: Metadata = pageMetadata({
  path: "/accessibility",
  title: "Accessibility",
  description: "Our commitment to an accessible website for seniors and people with disabilities, our WCAG 2.2 AA goal, and how to report accessibility problems.",
});

export default async function AccessibilityPage() {
  const business = await getSettings("business");
  return (
    <LegalPage title="Accessibility">
      <p>
        Many of the people we serve live with changes in vision, hearing, or dexterity. We want our website to be easy for everyone to use, including people who rely on
        screen readers, keyboard navigation, magnification, or voice control.
      </p>

      <h2>Our goal</h2>
      <p>
        We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at Level AA. This is a goal we work toward, not a certification. We have not had the website
        formally audited by an outside party, and some parts may not yet fully meet the standard.
      </p>

      <h2>What we have done</h2>
      <ul>
        <li>Larger default text and high-contrast colors</li>
        <li>Headings and page landmarks that describe the structure of each page</li>
        <li>A &quot;Skip to main content&quot; link and visible focus outlines for keyboard users</li>
        <li>Form fields with written labels and clear error messages</li>
        <li>Buttons and links sized for easier tapping on phones and tablets</li>
        <li>Layouts that adapt to small screens and browser zoom</li>
        <li>Respect for the reduced-motion setting on your device</li>
      </ul>

      <h2>Tips for easier reading</h2>
      <ul>
        <li>To make text larger, hold the Control key (Command on a Mac) and press the plus key. Press minus to make it smaller again.</li>
        <li>Most phones and tablets let you increase text size in the display or accessibility settings. We are happy to show you how during a visit.</li>
      </ul>

      <h2>Report a problem or request help</h2>
      <p>
        If something on this website is hard to use, or you need information in a different format, please tell us. Let us know the page and what happened, and we will
        work to fix it.{business.phone ? " You can also call us to book or ask questions without using the website." : ""}
      </p>
      <ContactLines business={business} />
      <p>
        You can also read our <Link href="/privacy">privacy policy</Link> and <Link href="/terms">terms of service</Link>.
      </p>
    </LegalPage>
  );
}
