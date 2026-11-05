import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const rootPx = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).fontSize);

test.describe.configure({ mode: "serial" });

test("text size control enlarges text, is saved, and resets", async ({ page }) => {
  await page.goto("/");
  expect(await rootPx(page)).toBe("18px");
  const larger = page.getByRole("button", { name: "A+ larger text" });
  await larger.click();
  await larger.click();
  expect(await rootPx(page)).toBe("22px");
  await expect(page.getByRole("status").filter({ hasText: "Text size: Larger" })).toHaveCount(1);
  // Saved across pages and reloads
  await page.goto("/pricing");
  expect(await rootPx(page)).toBe("22px");
  await larger.click();
  await expect(larger).toBeDisabled();
  expect(await rootPx(page)).toBe("24px");
  await page.getByRole("button", { name: "A standard text size" }).click();
  expect(await rootPx(page)).toBe("18px");
  const smaller = page.getByRole("button", { name: "A− smaller text" });
  await smaller.click();
  expect(await rootPx(page)).toBe("16px");
  await expect(smaller).toBeDisabled();
  await page.getByRole("button", { name: "A standard text size" }).click();
});

test("high contrast mode toggles, is saved, and follows the system setting until changed", async ({ page }) => {
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "High contrast" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.documentElement.dataset.contrast)).toBe("high");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(255, 255, 255)");
  await page.goto("/services");
  expect(await page.evaluate(() => document.documentElement.dataset.contrast)).toBe("high");
  await page.getByRole("button", { name: "High contrast" }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.contrast)).toBeUndefined();
});

test("operating-system 'increase contrast' turns on high contrast by default", async ({ browser }) => {
  const ctx = await browser.newContext({ contrast: "more" });
  const page = await ctx.newPage();
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.dataset.contrast)).toBe("high");
  await expect(page.getByRole("button", { name: "High contrast" })).toHaveAttribute("aria-pressed", "true");
  // An explicit choice wins over the system setting
  await page.getByRole("button", { name: "High contrast" }).click();
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.contrast)).toBeUndefined();
  await ctx.close();
});

test("keyboard users reach the skip link first and can skip to the content", async ({ page }) => {
  await page.goto("/about");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.closest("main") !== null);
  expect(focused).toBe(true);
  // Focus indicator is clearly visible (3px outline)
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineWidth);
  expect(parseFloat(outline)).toBeGreaterThanOrEqual(3);
});

test("mobile menu opens with the keyboard, closes with Escape and after navigating", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto("/");
  const toggle = page.locator(".site-nav-toggle button");
  // Wait until the page is interactive (hydrated), then open with the keyboard.
  await expect(async () => {
    if ((await toggle.getAttribute("aria-expanded")) !== "true") {
      await toggle.focus();
      await page.keyboard.press("Enter");
    }
    await expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 1000 });
  }).toPass({ timeout: 20000 });
  await expect(page.getByRole("button", { name: "Close" })).toBeVisible();
  const panel = page.locator(".site-nav-toggle nav");
  await expect(panel.getByRole("link", { name: "Tech Tips" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Menu" })).toBeFocused();
  await expect(panel).toBeHidden();
  await page.getByRole("button", { name: "Menu" }).click();
  await panel.getByRole("link", { name: "Pricing" }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "false");
  await ctx.close();
});

test("larger text sizes switch the desktop header to the menu instead of overflowing", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(page.locator(".site-nav-desktop")).toBeVisible();
  await page.getByRole("button", { name: "A+ larger text" }).click();
  await page.getByRole("button", { name: "A+ larger text" }).click();
  await expect(page.locator(".site-nav-desktop")).toBeHidden();
  await expect(page.getByRole("button", { name: "Menu" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "A standard text size" }).click();
});

test("Call Kindred appears only when a phone number is configured", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Call Kindred/ })).toHaveCount(0);
  const prisma = new PrismaClient();
  const row = await prisma.setting.findUnique({ where: { key: "business" } });
  const original = row?.value as Record<string, unknown> | undefined;
  try {
    await prisma.setting.upsert({ where: { key: "business" }, create: { key: "business", value: { ...(original ?? {}), phone: "(330) 555-0142" } }, update: { value: { ...(original ?? {}), phone: "(330) 555-0142" } } });
    await page.goto("/");
    const hero = page.locator("section[aria-labelledby=hero-title]").getByRole("link", { name: "Call Kindred at (330) 555-0142" });
    await expect(hero).toHaveAttribute("href", "tel:3305550142");
    await expect(page.locator("section[aria-labelledby=hero-title]").getByRole("link", { name: "Schedule a Visit" })).toBeVisible();
    await expect(page.locator("header").getByRole("link", { name: "Call Kindred at (330) 555-0142" })).toHaveAttribute("href", "tel:3305550142");
    await page.goto("/schedule");
    await expect(page.getByRole("link", { name: "Call Kindred at (330) 555-0142" }).first()).toBeVisible();
    await page.goto("/contact");
    await expect(page.locator("main").getByRole("link", { name: "Call Kindred at (330) 555-0142" })).toBeVisible();
  } finally {
    if (original) await prisma.setting.update({ where: { key: "business" }, data: { value: original as object } });
    await prisma.$disconnect();
  }
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Call Kindred/ })).toHaveCount(0);
});

test("our story appears on the About page and in short on the homepage", async ({ page }) => {
  await page.goto("/");
  const section = page.locator("section[aria-labelledby=story-title]");
  await expect(section.getByRole("heading", { name: "A Little More Than Technology Support" })).toBeVisible();
  await section.getByRole("link", { name: "Learn More About Kindred" }).click();
  await expect(page).toHaveURL(/\/about#why-title$/);
  const why = page.locator("section[aria-labelledby=why-title]");
  await expect(why.getByRole("heading", { name: "Why Kindred Exists" })).toBeVisible();
  await expect(why).toContainText("Through my involvement at church, I've seen firsthand");
  await expect(why).toContainText("providing knowledgeable, patient, and respectful technology assistance with a personal touch.");
  await expect(why).toContainText("Modern Technology. Old-Fashioned Service.");
  // No invented owner portrait
  await expect(why.locator("img")).toHaveCount(0);
});

test("no automatically detectable WCAG A/AA issues in high contrast or at the largest text size", async ({ browser }) => {
  const issues: string[] = [];
  for (const [label, init] of [
    ["high contrast", () => localStorage.setItem("kts-contrast", "high")],
    ["largest text", () => localStorage.setItem("kts-text-size", "3")],
  ] as const) {
    for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const ctx = await browser.newContext({ viewport: vp });
      await ctx.addInitScript(init);
      const page = await ctx.newPage();
      for (const path of ["/", "/about", "/schedule", "/senior-living", "/pricing", "/contact", "/tech-tips"]) {
        await page.goto(path);
        const r = await new AxeBuilder({ page }).withTags(WCAG).analyze();
        issues.push(...r.violations.map((v) => `${label} ${vp.width}px ${path}: ${v.id} - ${v.nodes[0]?.target.join(" ")}`));
      }
      await ctx.close();
    }
  }
  expect(issues).toEqual([]);
});

test("booking still works at the largest text size on a phone", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => localStorage.setItem("kts-text-size", "3"));
  const page = await ctx.newPage();
  await page.goto("/schedule");
  await expect(page.getByRole("heading", { name: "How booking works" })).toBeVisible();
  await expect(page.getByText("Step 1 of 6", { exact: true })).toBeVisible();
  await page.getByLabel(/Remote Support/).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Step 2 of 6", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  const errors = page.locator("#wizard-errors");
  await expect(errors).toBeFocused();
  await expect(errors).toContainText("Please enter a first name.");
  await page.getByLabel("First name").fill("Large");
  await page.getByLabel("Last name").fill(`Text${Date.now()}`);
  await page.getByLabel("Phone number").fill("330-555-0178");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator("label:has(input[name=slot])").first().click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel(/I have read the/).check();
  await page.getByRole("button", { name: "Submit my request" }).click();
  await page.waitForURL(/confirmation/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  // Cancel the test booking
  await page.getByRole("link", { name: /View or change/ }).click();
  await page.getByRole("button", { name: "Cancel appointment" }).click();
  await page.getByRole("button", { name: "Yes, cancel my appointment" }).click();
  await expect(page.locator("main [role=status]").filter({ hasText: "canceled" }).first()).toBeVisible();
  await ctx.close();
});
