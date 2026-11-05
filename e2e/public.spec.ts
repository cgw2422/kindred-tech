import { expect, test } from "@playwright/test";

const PAGES = [
  "/", "/services", "/services/computer-laptop-support", "/services/smartphone-tablet-help", "/services/wifi-internet-support",
  "/services/smart-tv-streaming-setup", "/services/technology-lessons", "/services/online-safety-scam-protection",
  "/services/subscription-review-savings", "/services/technology-checkup", "/senior-living", "/pricing", "/about",
  "/service-areas", "/schedule", "/contact", "/faq", "/privacy", "/terms", "/accessibility",
];

test("all public pages load with a single h1 and no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const path of PAGES) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator("h1"), path).toHaveCount(1);
    await expect(page.locator("main"), path).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

test("home page communicates the core message and CTAs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Technology Should Be Simple");
  await expect(page.getByRole("link", { name: "Schedule a Visit" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Explore Our Services/i }).first()).toBeVisible();
});

test("sitemap and robots are served", async ({ request }) => {
  expect((await request.get("/sitemap.xml")).status()).toBe(200);
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /admin");
});

test("guest can book an appointment end to end and manage it", async ({ page }) => {
  await page.goto("/schedule");
  await page.getByLabel(/Remote Support/).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("First name").fill("E2E");
  await page.getByLabel("Last name").fill(`Guest${Date.now()}`);
  await page.getByLabel("Phone number").fill("330-555-0177");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click(); // remote: no address
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator("label:has(input[name=slot])").first().click();
  await page.getByRole("button", { name: "Continue" }).click();
  // Terms are required
  await page.getByRole("button", { name: "Submit my request" }).click();
  await expect(page.locator('[role=alert]:not(#__next-route-announcer__)')).toContainText("terms");
  await page.getByLabel(/I have read the/).check();
  await page.getByRole("button", { name: "Submit my request" }).click();
  await page.waitForURL(/confirmation/);
  await expect(page.locator("h1")).toContainText(/received your request|confirmed/);
  await page.getByRole("link", { name: /View or change/ }).click();
  await expect(page.locator("h1")).toHaveText("Your appointment");
  await page.getByRole("button", { name: "Cancel appointment" }).click();
  await page.getByRole("button", { name: "Yes, cancel my appointment" }).click();
  await expect(page.locator('[role=status]').first()).toContainText("canceled");
});

test("booking wizard validates required fields", async ({ page }) => {
  await page.goto("/schedule");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator('[role=alert]:not(#__next-route-announcer__)')).toContainText("Please choose a service");
});
