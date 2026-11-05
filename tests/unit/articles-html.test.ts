import { describe, expect, it } from "vitest";
import { markdownToHtml, sanitizeArticleHtml, slugify, wordCount } from "@/lib/articles/html";
import { parseTag, srcSet, variantUrl } from "@/lib/media/urls";
import { normalizeCrop } from "@/lib/media/process";
import { ARTICLES_PART1 } from "../../prisma/seed-data/articles/part1";
import { ARTICLES_PART2 } from "../../prisma/seed-data/articles/part2";
import { ARTICLES_PART3 } from "../../prisma/seed-data/articles/part3";
import { ARTICLES_PART4 } from "../../prisma/seed-data/articles/part4";
import { ARTICLE_CATEGORY_SLUGS } from "../../prisma/seed-data/articles/types";

const ALL = [...ARTICLES_PART1, ...ARTICLES_PART2, ...ARTICLES_PART3, ...ARTICLES_PART4];

describe("article HTML sanitizer", () => {
  it("removes scripts, event handlers, styles and dangerous links", () => {
    const out = sanitizeArticleHtml(`<p onclick="x()">Hi <script>alert(1)</script><a href="javascript:alert(1)">bad</a><img src="x" onerror="y()"><span style="color:red">t</span></p><iframe src="https://x"></iframe>`);
    expect(out).not.toMatch(/script|onclick|onerror|javascript:|iframe|style=/);
    expect(out).toContain("Hi");
  });
  it("keeps allowed formatting and media references, and drops external image sources", () => {
    const out = sanitizeArticleHtml(`<h1>T</h1><h2>A</h2><p><b>b</b> <i>i</i> <a href="https://example.com">x</a></p><ul><li>1</li></ul><blockquote><p>q</p></blockquote><img data-media-id="cmabcdef1234567890" alt="Router" src="/media/x"><img src="https://evil.example/x.png">`);
    expect(out).toContain("<h2>T</h2>");
    expect(out).toContain("<strong>b</strong>");
    expect(out).toContain("<em>i</em>");
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('<img data-media-id="cmabcdef1234567890" alt="Router" />');
    expect(out).not.toContain("evil.example");
  });
});

describe("markdown conversion for seed articles", () => {
  it("converts headings, lists, quotes, emphasis and links", () => {
    const html = markdownToHtml("Intro **bold** and *soft*.\n\n## Steps\n\n1. One\n2. Two\n\n- A\n- B\n\n> Tip: be careful\n\nSee [this](/tech-tips/x).");
    expect(html).toContain("<p>Intro <strong>bold</strong> and <em>soft</em>.</p>");
    expect(html).toContain("<h2>Steps</h2>");
    expect(html).toContain("<ol><li>One</li><li>Two</li></ol>");
    expect(html).toContain("<ul><li>A</li><li>B</li></ul>");
    expect(html).toContain("<blockquote><p>Tip: be careful</p></blockquote>");
    expect(html).toContain('<a href="/tech-tips/x">this</a>');
  });
});

describe("seeded Tech Tips content", () => {
  it("has 20 complete, unique articles in valid categories", () => {
    expect(ALL).toHaveLength(20);
    expect(new Set(ALL.map((a) => a.seedKey)).size).toBe(20);
    expect(new Set(ALL.map((a) => a.slug)).size).toBe(20);
    for (const a of ALL) {
      expect(ARTICLE_CATEGORY_SLUGS as readonly string[], a.slug).toContain(a.category);
      const words = wordCount(markdownToHtml(a.body));
      expect(words, a.slug).toBeGreaterThanOrEqual(500);
      expect(words, a.slug).toBeLessThanOrEqual(950);
      expect(a.metaDescription.length, a.slug).toBeLessThanOrEqual(160);
      expect(a.seoTitle.length, a.slug).toBeLessThanOrEqual(65);
    }
  });
  it("contains no emojis, unresolved Markdown, or prices", () => {
    for (const a of ALL) {
      const html = markdownToHtml(a.body);
      expect(html, a.slug).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(html, a.slug).not.toMatch(/\*\*|\]\(/);
      expect(a.body, a.slug).not.toMatch(/\$\d/);
    }
  });
  it("only links to articles that exist", () => {
    const slugs = new Set(ALL.map((a) => a.slug));
    for (const a of ALL) {
      for (const m of a.body.matchAll(/\]\(\/tech-tips\/([a-z0-9-]+)\)/g)) expect(slugs.has(m[1]), `${a.slug} -> ${m[1]}`).toBe(true);
    }
  });
  it("scam articles never tell readers to share codes or passwords", () => {
    for (const a of ALL.filter((x) => x.category === "online-safety" || x.category === "passwords-accounts")) {
      expect(a.body, a.slug).not.toMatch(/\b(read|give|tell|share) (them|the caller) (the|your) (code|password)/i);
    }
  });
});

describe("media URLs and crops", () => {
  it("parses variant tags", () => {
    expect(parseTag("a3")).toEqual({ kind: "asset", version: 3 });
    expect(parseTag("o2")).toEqual({ kind: "original", version: 2 });
    expect(parseTag("p2003-home-hero")).toEqual({ kind: "slot", version: 2003, slotKey: "home-hero" });
    expect(parseTag("../etc")).toBeNull();
  });
  it("never upscales in srcset", () => {
    const s = srcSet("abc", "a1", 900, "webp");
    expect(s).toContain(variantUrl("abc", "a1", 800, "webp"));
    expect(s).toContain("960.webp 900w");
    expect(s).not.toContain("1200.webp");
  });
  it("normalizes crops", () => {
    expect(normalizeCrop({ x: 0, y: 0, w: 1, h: 1 })).toBeNull();
    expect(normalizeCrop({ x: 0.5, y: 0.5, w: 0.9, h: 0.9 })).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
    expect(normalizeCrop({ x: Number.NaN, y: 0, w: 1, h: 1 })).toBeNull();
  });
  it("slugifies titles", () => {
    expect(slugify("How to Spot a Fake Email!")).toBe("how-to-spot-a-fake-email");
    expect(slugify("Smart TVs & Streaming")).toBe("smart-tvs-and-streaming");
  });
});
