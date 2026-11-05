import { expect, test } from "@playwright/test";
import { login } from "./helpers";

const ALERT = "[role=alert]:not(#__next-route-announcer__)";

test("homepage offers two clear paths that route to the right places", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Technology Should Be Simple.");
  const personal = page.getByRole("article", { name: "Get Personal Tech Help" });
  const partner = page.getByRole("article", { name: "Partner With Kindred" });
  await expect(personal.getByRole("link", { name: "Schedule a Visit" })).toHaveAttribute("href", "/schedule");
  await expect(partner.getByRole("link", { name: "Request a Partnership Proposal" })).toHaveAttribute("href", "/senior-living#inquiry");
  await expect(page.getByRole("heading", { name: "Make Technology Support a Resident Amenity." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore Community Partnerships" }).first()).toHaveAttribute("href", "/senior-living");
  // Community administrators are never routed into residential booking
  for (const link of await partner.getByRole("link").all()) expect(await link.getAttribute("href")).not.toContain("/schedule");
});

test("residential prices are unchanged", async ({ page }) => {
  await page.goto("/pricing");
  const table = page.locator("table");
  for (const [service, price] of [
    ["Standard In-Home Support", "$99"],
    ["Smartphone or Tablet Lesson", "$79"],
    ["Remote Support", "$49"],
    ["Subscription Review & Savings", "$79"],
    ["New Computer Setup", "Starting at $149"],
    ["Kindred Technology Checkup", "$149"],
  ]) {
    await expect(table.getByRole("row", { name: new RegExp(service) })).toContainText(price);
  }
  await expect(page.getByText("Additional 30 minutes: $40").first()).toBeVisible();
  await expect(page.locator("#membership")).toContainText("$49");
  await expect(page.locator("#communities")).toContainText("custom quoted");
  await expect(page.locator("#communities").getByRole("link", { name: "Request a Partnership Proposal" })).toHaveAttribute("href", "/senior-living#inquiry");
  await expect(page.locator("body")).not.toContainText(/\$399|\$749|\$1,?399/);
});

test("partnership proposal form validates, saves, and appears as a community lead in admin", async ({ page }) => {
  const name = `E2E Commons ${Date.now()}`;
  await page.goto("/senior-living");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Technology Support Your Residents Will Appreciate.");
  const form = page.locator("#inquiry form");
  await form.getByRole("button", { name: "Request a Community Partnership Proposal" }).click();
  await expect(page.locator(ALERT).first()).toContainText("correct the highlighted fields");
  await expect(form.getByLabel(/Community name/)).toHaveAttribute("aria-invalid", "true");

  await form.getByLabel(/Community name/).fill(name);
  await form.getByLabel(/^City/).fill("Canton");
  await form.getByLabel(/Community type/).selectOption("ASSISTED_LIVING");
  await form.getByLabel(/Approximate number of residents/).fill("90");
  await form.getByLabel(/Your name/).fill("Robin Tester");
  await form.getByLabel(/Job title/).fill("Executive Director");
  await form.getByLabel(/^Email/).fill("robin.tester@example.com");
  await form.getByLabel(/Preferred frequency of visits/).selectOption("MONTHLY");
  await form.getByLabel(/Type of program/).selectOption("RECURRING_CONTRACT");
  await form.getByLabel(/Additional information/).fill("Interested in a monthly program.");
  await form.getByRole("button", { name: "Request a Community Partnership Proposal" }).click();
  const done = page.locator("#inquiry [role=status]");
  await expect(done).toContainText("received your partnership proposal request");
  await expect(done).not.toContainText(/email (was|has been) sent/i);

  await login(page, "owner@example.com");
  await page.goto("/admin/leads");
  const community = page.locator("section, div").filter({ has: page.locator("#community") }).last();
  await expect(community).toContainText(name);
  await expect(community).toContainText("Assisted living community");
  await expect(community).toContainText("Canton, OH");
  await expect(community).toContainText("Preferred visits: Monthly");
  await page.goto("/admin/facilities?tab=inquiries");
  await expect(page.getByRole("heading", { name })).toBeVisible();
});

test("contact form saves a residential message separately from community leads", async ({ page }) => {
  const who = `E2E Resident ${Date.now()}`;
  await page.goto("/contact");
  await page.getByLabel(/Your name|^Name/).first().fill(who);
  await page.getByLabel(/^Phone/).fill("330-555-0144");
  await page.getByLabel(/message|How can we help/i).last().fill("Question about help with my tablet.");
  await page.getByRole("button", { name: /send/i }).click();
  await expect(page.locator("[role=status]").first()).toContainText("received your message");
  await login(page, "owner@example.com");
  await page.goto("/admin/leads");
  const residentialCard = page.locator("div").filter({ has: page.locator("#residential") }).last();
  await expect(residentialCard).toContainText(who);
  const communityCard = page.locator("div").filter({ has: page.locator("#community") }).last();
  await expect(communityCard).not.toContainText(who);
});
