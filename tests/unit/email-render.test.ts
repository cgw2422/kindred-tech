import { describe, expect, it } from "vitest";
import { extractVariables, renderEmail } from "@/lib/email/render";
import { DEFAULT_TEMPLATES } from "@/lib/email/defaults";

describe("email rendering", () => {
  it("merges variables into subject and body", () => {
    const r = renderEmail({ subject: "Hi {{name}}", body: "Hello **{{name}}**", vars: { name: "Margaret" } });
    expect(r.subject).toBe("Hi Margaret");
    expect(r.html).toContain("<strong>Margaret</strong>");
    expect(r.text).toContain("Hello Margaret");
    expect(r.missing).toEqual([]);
  });
  it("escapes HTML in merge values", () => {
    const r = renderEmail({ subject: "x", body: "Note: {{note}}", vars: { note: "<script>alert(1)</script>" } });
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
  });
  it("reports missing variables", () => {
    const r = renderEmail({ subject: "{{a}}", body: "{{b}}", vars: {} });
    expect(r.missing.sort()).toEqual(["a", "b"]);
  });
  it("renders buttons and lists and blocks unsafe link schemes", () => {
    const r = renderEmail({ subject: "s", body: "[[button:Go|{{url}}]]\n\n- one\n- two\n\n[bad](javascript:alert(1))", vars: { url: "https://example.com/x?a=1&b=2" } });
    expect(r.html).toContain('href="https://example.com/x?a=1&amp;b=2"');
    expect(r.html).toContain("<li");
    expect(r.html).not.toContain("javascript:");
    expect(r.text).toContain("Go: https://example.com/x?a=1&b=2");
  });
  it("adds an unsubscribe link only when provided", () => {
    expect(renderEmail({ subject: "s", body: "b", vars: {}, unsubscribeUrl: "https://x.test/u?t=1" }).html).toContain("Unsubscribe");
    expect(renderEmail({ subject: "s", body: "b", vars: {} }).html).not.toContain("Unsubscribe");
  });
  it("renders every default template with its sample data and no missing variables", () => {
    for (const t of DEFAULT_TEMPLATES) {
      const r = renderEmail({ subject: t.subject, body: t.body, vars: t.sampleVars });
      const vars = extractVariables(t.subject + t.body);
      const missing = r.missing.filter((m) => vars.includes(m) && (t.sampleVars as Record<string, string>)[m] !== "");
      expect(missing, t.key).toEqual([]);
      expect(r.subject.length, t.key).toBeGreaterThan(0);
    }
  });
});
