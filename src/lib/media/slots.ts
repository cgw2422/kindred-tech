/**
 * Fixed image slots on public pages. Pages render the assigned image when one is
 * set in Admin > Website > Page Images, and fall back to their text-only layout otherwise.
 */
export type SlotDef = {
  key: string;
  page: string;
  pagePath: string;
  label: string;
  description: string;
  /** Desktop aspect ratio (width / height) used for cropping and layout. */
  aspect: number;
  aspectLabel: string;
  /** Aspect used on phones (focal point controls what stays visible). */
  mobileAspect: number;
  recommended: string;
  /** CSS sizes attribute for responsive images. */
  sizes: string;
  /** Above-the-fold images load eagerly with high priority. */
  priority: boolean;
};

export const PAGE_IMAGE_SLOTS: SlotDef[] = [
  {
    key: "home-hero",
    page: "Homepage",
    pagePath: "/",
    label: "Hero photograph",
    description: "Shown beside the headline. Without a photo, the original text panel is shown.",
    aspect: 4 / 3,
    aspectLabel: "4:3 (landscape)",
    mobileAspect: 4 / 3,
    recommended: "At least 1600 × 1200 pixels",
    sizes: "(min-width: 1024px) 520px, 100vw",
    priority: true,
  },
  {
    key: "home-secondary",
    page: "Homepage",
    pagePath: "/",
    label: "Secondary photograph (optional)",
    description: "Shown beside the \"What you can expect from us\" section.",
    aspect: 4 / 5,
    aspectLabel: "4:5 (portrait)",
    mobileAspect: 16 / 10,
    recommended: "At least 1200 × 1500 pixels",
    sizes: "(min-width: 1024px) 380px, 100vw",
    priority: false,
  },
  {
    key: "senior-living-hero",
    page: "Senior Living",
    pagePath: "/senior-living",
    label: "Hero photograph",
    description: "Shown beside the page headline.",
    aspect: 4 / 3,
    aspectLabel: "4:3 (landscape)",
    mobileAspect: 4 / 3,
    recommended: "At least 1600 × 1200 pixels",
    sizes: "(min-width: 1024px) 520px, 100vw",
    priority: true,
  },
  {
    key: "senior-living-partnership",
    page: "Senior Living",
    pagePath: "/senior-living",
    label: "Community partnership photograph",
    description: "Shown in the \"What a typical support visit looks like\" section.",
    aspect: 3 / 2,
    aspectLabel: "3:2 (landscape)",
    mobileAspect: 3 / 2,
    recommended: "At least 1500 × 1000 pixels",
    sizes: "(min-width: 1024px) 440px, 100vw",
    priority: false,
  },
  {
    key: "about-owner",
    page: "About",
    pagePath: "/about",
    label: "Owner photograph",
    description: "Shown with the \"Meet the owner\" section. Without a photo, that section shows text only.",
    aspect: 4 / 5,
    aspectLabel: "4:5 (portrait)",
    mobileAspect: 4 / 5,
    recommended: "At least 1000 × 1250 pixels",
    sizes: "(min-width: 768px) 320px, 80vw",
    priority: false,
  },
  {
    key: "services-featured",
    page: "Services",
    pagePath: "/services",
    label: "Featured photograph",
    description: "Shown beside the Services page introduction.",
    aspect: 4 / 3,
    aspectLabel: "4:3 (landscape)",
    mobileAspect: 16 / 10,
    recommended: "At least 1600 × 1200 pixels",
    sizes: "(min-width: 1024px) 480px, 100vw",
    priority: true,
  },
];

export function getSlotDef(key: string): SlotDef | undefined {
  return PAGE_IMAGE_SLOTS.find((s) => s.key === key);
}

export type SlotKey = (typeof PAGE_IMAGE_SLOTS)[number]["key"];
