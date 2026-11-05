import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("public site has no horizontal scroll on a phone", async ({ page }) => {
  for (const path of ["/", "/schedule", "/pricing", "/senior-living"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});

test("technician portal works on a phone", async ({ page }) => {
  await login(page, "tech@example.com");
  await expect(page).toHaveURL(/\/tech/);
  await expect(page.locator("h1").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
