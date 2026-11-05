/**
 * Seed format for Tech Tips articles. Bodies are written in a small Markdown
 * subset that the seed converts to sanitized HTML:
 *   ## Heading 2        ### Heading 3
 *   blank-line separated paragraphs
 *   - bullet item       1. numbered item (consecutive lines form one list)
 *   > blockquote line
 *   **bold**  *italic*  [link text](/path or https://...)
 * No raw HTML, no images, no tables, no emojis.
 */
export type SeedArticle = {
  /** Stable identifier; never change it after seeding (used for idempotency). */
  seedKey: string;
  slug: string;
  title: string;
  /** One of the category slugs in ARTICLE_CATEGORY_SLUGS. */
  category: string;
  /** 1–2 sentences, 120–200 characters, shown on cards. */
  excerpt: string;
  /** Up to ~60 characters. */
  seoTitle: string;
  /** 120–155 characters. */
  metaDescription: string;
  /** Markdown subset body, roughly 500–900 words. Do not repeat the title as a heading. */
  body: string;
};

export const ARTICLE_CATEGORY_SLUGS = [
  "smartphones-tablets",
  "computers-laptops",
  "internet-wifi",
  "online-safety",
  "smart-tv-streaming",
  "staying-connected",
  "passwords-accounts",
  "buying-guides",
  "general-tips",
] as const;
