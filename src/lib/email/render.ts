/**
 * Email template rendering. Templates are stored as plain text with:
 *   {{variable}}           merge variable (HTML-escaped)
 *   **bold**               bold text
 *   [Link text](url)       inline link
 *   [[button:Label|url]]   call-to-action button (own line)
 *   Blank line             paragraph break
 *   Lines starting "- "    bullet list
 * Unknown variables render as empty strings and are reported in `missing`.
 */

export type MergeVars = Record<string, string | number | null | undefined>;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const VAR_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export function extractVariables(template: string): string[] {
  const out = new Set<string>();
  for (const m of template.matchAll(VAR_RE)) out.add(m[1]);
  return [...out];
}

export function mergeText(template: string, vars: MergeVars, missing?: Set<string>): string {
  return template.replace(VAR_RE, (_, name: string) => {
    const v = vars[name];
    if (v === undefined || v === null || v === "") {
      missing?.add(name);
      return "";
    }
    return String(v);
  });
}

function safeUrl(url: string): string {
  const u = url.trim();
  if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
  return "#";
}

function inlineHtml(escaped: string): string {
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text: string, url: string) => `<a href="${safeUrl(url)}" style="color:#10375B;text-decoration:underline;">${text}</a>`);
}

function bodyToHtml(mergedEscaped: string): string {
  const blocks = mergedEscaped.split(/\n\s*\n/);
  return blocks
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      const button = /^\[\[button:([^|\]]+)\|([^\]]+)\]\]$/.exec(trimmed);
      if (button) {
        return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:#477C32;border-radius:6px;"><a href="${safeUrl(button[2])}" style="display:inline-block;padding:14px 28px;font-family:Arial,sans-serif;font-size:18px;font-weight:bold;color:#ffffff;text-decoration:none;">${button[1]}</a></td></tr></table>`;
      }
      const lines = trimmed.split("\n");
      if (lines.every((l) => l.trim().startsWith("- "))) {
        return `<ul style="margin:0 0 16px 20px;padding:0;">${lines.map((l) => `<li style="margin:0 0 8px;">${inlineHtml(l.trim().slice(2))}</li>`).join("")}</ul>`;
      }
      return `<p style="margin:0 0 16px;">${lines.map(inlineHtml).join("<br>")}</p>`;
    })
    .join("\n");
}

function bodyToText(merged: string): string {
  return merged
    .replace(/\[\[button:([^|\]]+)\|([^\]]+)\]\]/g, "$1: $2")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)")
    .replace(/\*\*(.+?)\*\*/g, "$1");
}

export type RenderedEmail = { subject: string; html: string; text: string; missing: string[] };

export function renderEmail(params: {
  subject: string;
  body: string;
  vars: MergeVars;
  businessName?: string;
  footerLines?: string[];
  unsubscribeUrl?: string | null;
}): RenderedEmail {
  const missing = new Set<string>();
  const subject = mergeText(params.subject, params.vars, missing).replace(/[\r\n]+/g, " ").trim();
  // Escape variable VALUES before merging so customer-provided data cannot inject HTML.
  const escapedVars: MergeVars = {};
  for (const [k, v] of Object.entries(params.vars)) escapedVars[k] = v == null ? v : escapeHtml(String(v));
  const htmlMerged = mergeText(escapeHtml(params.body).replace(/&quot;/g, '"').replace(/&#39;/g, "'"), escapedVars);
  const textMerged = mergeText(params.body, params.vars, missing);
  const businessName = escapeHtml(params.businessName ?? "Kindred Tech Support");
  const footer = (params.footerLines ?? []).filter(Boolean).map((l) => escapeHtml(l)).join("<br>");
  const unsubscribe = params.unsubscribeUrl
    ? `<p style="margin:12px 0 0;"><a href="${safeUrl(params.unsubscribeUrl)}" style="color:#414B55;">Unsubscribe from marketing emails</a></p>`
    : "";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#F7F7F3;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F7F3;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #dfe3dc;border-radius:8px;">
<tr><td style="background:#10375B;padding:20px 28px;border-radius:8px 8px 0 0;">
<span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#ffffff;font-weight:bold;">${businessName}</span><br>
<span style="font-family:Arial,sans-serif;font-size:13px;color:#EDF4E8;">Modern Technology. Old-Fashioned Service.</span>
</td></tr>
<tr><td style="padding:28px;font-family:Arial,sans-serif;font-size:17px;line-height:1.6;color:#414B55;">
${bodyToHtml(htmlMerged)}
</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #e6e9e3;font-family:Arial,sans-serif;font-size:13px;line-height:1.5;color:#414B55;">
${footer}${unsubscribe}
</td></tr>
</table></td></tr></table></body></html>`;

  const text = [bodyToText(textMerged).trim(), "", "--", params.businessName ?? "Kindred Tech Support", ...(params.footerLines ?? []).filter(Boolean), params.unsubscribeUrl ? `Unsubscribe from marketing emails: ${params.unsubscribeUrl}` : ""]
    .filter((l) => l !== undefined)
    .join("\n")
    .trim();

  return { subject, html, text, missing: [...missing] };
}
