import sanitizeHtml from "sanitize-html";

/**
 * Article HTML handling.
 * - sanitizeArticleHtml(): allowlist sanitizer applied on every save (editor output is untrusted).
 * - markdownToHtml(): converts the small Markdown subset used by seed articles.
 * Inline images are stored as <img data-media-id="..." alt="..."> and rendered responsively.
 */
export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["h2", "h3", "h4", "p", "br", "strong", "em", "u", "s", "ul", "ol", "li", "a", "blockquote", "img", "hr"],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["data-media-id", "alt"],
      ol: ["start"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesAppliedToAttributes: ["href"],
    allowProtocolRelative: false,
    transformTags: {
      h1: "h2",
      h5: "h4",
      h6: "h4",
      b: "strong",
      i: "em",
      a: (tagName, attribs) => {
        const href = attribs.href ?? "";
        const external = /^https?:\/\//i.test(href);
        const out: Record<string, string> = { href };
        if (attribs.title) out.title = attribs.title;
        if (external) {
          out.target = "_blank";
          out.rel = "noopener noreferrer";
        }
        return { tagName, attribs: out };
      },
    },
    exclusiveFilter: (frame) => (frame.tag === "img" && !/^[a-z0-9]{10,40}$/i.test(frame.attribs["data-media-id"] ?? "")) || (frame.tag === "p" && !frame.text.trim() && !frame.mediaChildren?.length),
  }).trim();
}

export function htmlToPlainText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim();
}

export function wordCount(html: string): number {
  const t = htmlToPlainText(html);
  return t ? t.split(" ").length : 0;
}

export function readingMinutes(html: string): number {
  return Math.max(1, Math.round(wordCount(html) / 200));
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inline(md: string): string {
  let s = escapeHtml(md);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text: string, url: string) => `<a href="${url.replace(/"/g, "%22")}">${text}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  return s;
}

/** Converts the seed Markdown subset (## / ###, paragraphs, - and 1. lists, > quotes, **, *, links). */
export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  let quote: string[] = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.type}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote><p>${inline(quote.join(" "))}</p></blockquote>`);
    quote = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushAll();
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = /^(#{2,4})\s+(.*)$/.exec(line))) {
      flushAll();
      const level = m[1].length;
      out.push(`<h${level}>${inline(m[2])}</h${level}>`);
    } else if ((m = /^[-*]\s+(.*)$/.exec(line))) {
      flushPara();
      flushQuote();
      if (!list || list.type !== "ul") {
        flushList();
        list = { type: "ul", items: [] };
      }
      list.items.push(m[1]);
    } else if ((m = /^\d+[.)]\s+(.*)$/.exec(line))) {
      flushPara();
      flushQuote();
      if (!list || list.type !== "ol") {
        flushList();
        list = { type: "ol", items: [] };
      }
      list.items.push(m[1]);
    } else if ((m = /^>\s?(.*)$/.exec(line))) {
      flushPara();
      flushList();
      quote.push(m[1]);
    } else {
      flushList();
      flushQuote();
      para.push(line);
    }
  }
  flushAll();
  return sanitizeArticleHtml(out.join("\n"));
}

/** Media ids referenced by inline images in the article HTML. */
export function inlineMediaIds(html: string): string[] {
  return [...new Set([...html.matchAll(/data-media-id="([a-z0-9]+)"/gi)].map((m) => m[1]))];
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}
