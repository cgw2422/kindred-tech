import sharp from "sharp";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

const ALERT = "[role=alert]:not(#__next-route-announcer__)";

async function testPhoto() {
  return sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: 16, g: 55, b: 91 } } })
    .composite([{ input: Buffer.from('<svg width="1600" height="1200"><circle cx="800" cy="600" r="300" fill="#477C32"/></svg>') }])
    .jpeg()
    .toBuffer();
}

test.describe.configure({ mode: "serial" });

test("admin uploads a photo, publishes it to the homepage hero, then removes it", async ({ page, request }) => {
  await login(page, "owner@example.com");
  await page.goto("/admin/media");
  await expect(page.getByRole("heading", { name: "Media Library" })).toBeVisible();
  const name = `e2e-hero-${Date.now()}`;
  await page.locator('input[type=file]').first().setInputFiles({ name: `${name}.jpg`, mimeType: "image/jpeg", buffer: await testPhoto() });
  await expect(page.getByText("Uploaded")).toBeVisible({ timeout: 20000 });

  await page.goto(`/admin/media?q=${encodeURIComponent(name.replace(/-/g, " "))}`);
  await page.getByRole("link", { name: new RegExp(name.replace(/-/g, " ")) }).click();
  await page.getByLabel(/^Alt text/).fill("A navy and green test graphic");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.locator("main [role=status]").first()).toContainText("saved");

  await page.goto("/admin/page-images/home-hero");
  await page.getByRole("button", { name: /Choose or upload a photo|Choose a different photo/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Search images").fill(name.replace(/-/g, " "));
  await dialog.getByRole("button", { name: new RegExp(name.replace(/-/g, " ")) }).click();
  await expect(page.getByText("Desktop", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save and publish" }).click();
  await expect(page.locator("main [role=status]").first()).toContainText("Published");

  await page.goto("/");
  const hero = page.locator("section[aria-labelledby=hero-title] picture img");
  await expect(hero).toHaveAttribute("alt", "A navy and green test graphic");
  await expect(hero).toHaveAttribute("fetchpriority", "high");
  const src = await hero.getAttribute("src");
  expect(src).toMatch(/^\/media\/[a-z0-9]+\/p\d+-home-hero\/\d+\.jpg$/);
  const img = await request.get(src!);
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toBe("image/jpeg");
  expect(img.headers()["cache-control"]).toContain("immutable");
  await expect(page.getByText("Technology Help With a Personal Touch.")).toHaveCount(0);

  await page.goto("/admin/page-images/home-hero");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Remove photo" }).click();
  await expect(page.locator("main [role=status]").first()).toContainText("Removed");
  await page.goto("/");
  await expect(page.getByText("Technology Help With a Personal Touch.")).toBeVisible();

  // Clean up: delete the unused test image from the Media Library.
  await page.goto(`/admin/media?q=${encodeURIComponent(name.replace(/-/g, " "))}`);
  await page.getByRole("link", { name: new RegExp(name.replace(/-/g, " ")) }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete image" }).click();
  await expect(page.locator("main [role=status]").first()).toContainText("Image deleted");
});

test("upload endpoint rejects anonymous users and non-images", async ({ page, request }) => {
  const anon = await request.post("/admin/media/upload", { multipart: { file: { name: "x.jpg", mimeType: "image/jpeg", buffer: await testPhoto() } } });
  expect(anon.status()).toBe(403);
  await login(page, "owner@example.com");
  const bad = await page.request.post("/admin/media/upload", {
    headers: { origin: "http://localhost:3000" },
    multipart: { file: { name: "x.jpg", mimeType: "image/jpeg", buffer: Buffer.from("<html>not an image</html>") } },
  });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error).toMatch(/not a readable/);
  const crossSite = await page.request.post("/admin/media/upload", { headers: { origin: "https://evil.example" }, multipart: { file: { name: "x.jpg", mimeType: "image/jpeg", buffer: await testPhoto() } } });
  expect(crossSite.status()).toBe(403);
});

test("drafts are private; bulk publish makes articles public; article page and homepage tips render", async ({ page, request }) => {
  expect((await request.get("/tech-tips/spot-a-fake-email")).status()).toBe(404);
  await login(page, "owner@example.com");
  await page.goto("/admin/tech-tips?q=fake");
  for (const title of ["How to Spot a Fake Email", "How to Recognize Fake Computer Virus Warnings"]) {
    await page.getByRole("checkbox", { name: `Select ${title}` }).check();
  }
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.locator("main [role=status]").first()).toContainText("2 articles published");

  await page.goto("/tech-tips");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Helpful technology tips");
  await expect(page.getByRole("link", { name: "How to Spot a Fake Email" })).toBeVisible();
  await page.getByRole("link", { name: "How to Spot a Fake Email" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("How to Spot a Fake Email");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Online Safety & Scam Prevention");
  await expect(page.getByRole("heading", { name: "Still Need a Hand?" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Schedule a Visit" }).last()).toHaveAttribute("href", "/schedule");
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(ld.some((t) => t.includes('"@type":"Article"'))).toBe(true);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/tech-tips\/spot-a-fake-email$/);
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");

  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/tech-tips/spot-a-fake-email");
  expect(sitemap).not.toContain("/tech-tips/make-text-bigger-iphone");

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Helpful Technology Tips" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View All Tech Tips" })).toHaveAttribute("href", "/tech-tips");

  // Draft preview is only for admins
  await page.goto("/admin/tech-tips?q=iphone");
  const previewHref = await page.getByRole("link", { name: /Preview How to Make Text Bigger on Your iPhone/ }).getAttribute("href");
  await page.goto(previewHref!);
  await expect(page.locator("main [role=status]").first()).toContainText("This is a draft");
  const anonPreview = await request.get(previewHref!, { maxRedirects: 0 });
  expect([302, 303, 307, 308]).toContain(anonPreview.status());

  // Restore the drafts so the owner can review them
  await page.goto("/admin/tech-tips?status=PUBLISHED");
  for (const title of ["How to Spot a Fake Email", "How to Recognize Fake Computer Virus Warnings"]) {
    await page.getByRole("checkbox", { name: `Select ${title}` }).check();
  }
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Unpublish" }).click();
  await expect(page.locator("main [role=status]").first()).toContainText("2 articles unpublished");
  expect((await request.get("/tech-tips/spot-a-fake-email")).status()).toBe(404);
});

test("admin writes a new article in the rich-text editor, saves a draft, then deletes it", async ({ page }) => {
  await login(page, "owner@example.com");
  await page.goto("/admin/tech-tips/new");
  const title = `E2E Article ${Date.now()}`;
  await page.getByLabel(/^Title/).fill(title);
  await page.getByLabel(/^Summary/).fill("A short test summary for the editor.");
  const editor = page.locator(".ProseMirror");
  await editor.click();
  await page.keyboard.type("This paragraph was typed in the editor. ");
  await page.getByRole("button", { name: "Bold" }).click();
  await page.keyboard.type("Bold words.");
  await page.getByRole("button", { name: "Bold" }).click();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Bulleted list" }).click();
  await page.keyboard.type("First point");
  await page.getByLabel(/^Category/).selectOption({ label: "General Technology Tips" });
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForURL(/\/admin\/tech-tips\/[a-z0-9]+\?ok=/);
  await expect(page.locator("main [role=status]").first()).toContainText("Draft saved");
  await expect(page.locator(".ProseMirror strong")).toHaveText("Bold words.");
  await expect(page.locator(".ProseMirror ul li")).toHaveText("First point");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("main [role=status]").first()).toContainText("Article deleted");
  await expect(page.locator(ALERT)).toHaveCount(0);
});
