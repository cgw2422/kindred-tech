import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("protected areas redirect anonymous visitors to sign in", async ({ page }) => {
  for (const path of ["/admin", "/tech", "/portal", "/facility"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/login/);
  }
});

test("wrong password is rejected without revealing which part was wrong", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#password-email").fill("owner@example.com");
  await page.locator("#password-password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.locator('[role=alert]:not(#__next-route-announcer__)')).toContainText("did not match");
});

test("owner reaches the admin dashboard and core admin pages", async ({ page }) => {
  await login(page, "owner@example.com");
  await expect(page).toHaveURL(/\/admin/);
  for (const path of ["/admin", "/admin/calendar?view=week", "/admin/appointments", "/admin/customers", "/admin/dispatch", "/admin/reports", "/admin/invoices", "/admin/memberships", "/admin/facilities", "/admin/help-days", "/admin/services", "/admin/settings", "/admin/email-templates", "/admin/users"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator("h1").first(), path).toBeVisible();
  }
});

test("technician cannot open admin pages", async ({ page }) => {
  await login(page, "tech@example.com");
  await expect(page).toHaveURL(/\/tech/);
  await page.goto("/admin/customers");
  await expect(page).toHaveURL(/\/forbidden/);
});

test("dispatcher cannot open settings or users", async ({ page }) => {
  await login(page, "dispatcher@example.com");
  await page.goto("/admin/settings");
  await expect(page).toHaveURL(/\/forbidden/);
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/forbidden/);
});

test("facility contact sees the facility portal but not admin or customer portal", async ({ page }) => {
  await login(page, "activities.sample@example.com");
  await expect(page).toHaveURL(/\/facility/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/forbidden/);
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/forbidden/);
});

test("customer sees their portal and cannot open admin", async ({ page }) => {
  await login(page, "margaret.sample@example.com");
  await expect(page).toHaveURL(/\/portal/);
  await expect(page.locator("h1")).toContainText("Welcome");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/forbidden/);
});

test("CSV export requires permission", async ({ page, request }) => {
  const anon = await request.get("/admin/reports/export?report=revenue");
  expect(anon.status()).toBe(403);
  await login(page, "owner@example.com");
  const res = await page.request.get("/admin/reports/export?report=revenue");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
});
