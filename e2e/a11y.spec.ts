import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function scan(page: import("@playwright/test").Page, path: string) {
  await page.goto(path);
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return results.violations.map((v) => `${path}: ${v.id} (${v.impact}) x${v.nodes.length} - ${v.nodes[0]?.target.join(" ")}`);
}

test("public pages have no automatically detectable WCAG A/AA violations", async ({ page }) => {
  const all: string[] = [];
  for (const path of ["/", "/services", "/services/subscription-review-savings", "/services/technology-checkup", "/senior-living", "/pricing", "/schedule", "/contact", "/faq", "/login", "/service-areas", "/about"]) {
    all.push(...(await scan(page, path)));
  }
  expect(all).toEqual([]);
});

test("signed-in areas have no automatically detectable WCAG A/AA violations", async ({ page }) => {
  const all: string[] = [];
  await login(page, "owner@example.com");
  for (const path of ["/admin", "/admin/appointments", "/admin/calendar", "/admin/customers", "/admin/dispatch", "/admin/reports", "/admin/invoices", "/admin/facilities", "/admin/settings", "/tech"]) {
    all.push(...(await scan(page, path)));
  }
  expect(all).toEqual([]);
});
