import type { Page } from "@playwright/test";

export const PASSWORD = "KindredDev!2026";

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("#password-email").fill(email);
  await page.locator("#password-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}
