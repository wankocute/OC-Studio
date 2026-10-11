import { expect, test as setup } from "@playwright/test";

import { E2E_PASSWORD, E2E_SESSION_FILE } from "./environment";

setup("log in through the login form", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Mật khẩu").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  // The login page also has an "OC Studio" heading: wait for the URL, not the heading.
  await expect(page).toHaveURL(/\/$/);
  expect((await page.context().cookies()).map((cookie) => cookie.name)).toContain("oc_session");
  await page.context().storageState({ path: E2E_SESSION_FILE });
});
