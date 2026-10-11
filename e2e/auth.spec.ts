import { expect, test } from "@playwright/test";

import { E2E_PASSWORD } from "./environment";

// These tests start signed out (the other specs reuse the session from auth.setup.ts).
test.use({ storageState: { cookies: [], origins: [] } });

test("signed-out visitors only see the login page; API and media answer 401", async ({
  page,
  request,
}) => {
  await page.goto("/characters?sort=name");
  await expect(page).toHaveURL(/\/login\?next=%2Fcharacters%3Fsort%3Dname$/);
  await expect(page.getByLabel("Mật khẩu")).toBeVisible();

  expect((await request.get("/api/health")).status()).toBe(401);
  expect((await request.get("/media/0b0e7c2e-6c55-4c62-9a43-1b3f2c3d4e5f")).status()).toBe(401);
});

test("a wrong password is rejected; the right one returns to the requested page", async ({
  page,
}) => {
  await page.goto("/characters");
  await page.getByLabel("Mật khẩu").fill("sai-mat-khau");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  // Next's route announcer is also role="alert": match the message itself.
  await expect(page.getByText("Mật khẩu không đúng.")).toBeVisible();
  await expect(page.getByLabel("Mật khẩu")).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("Mật khẩu").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Thư viện nhân vật" })).toBeVisible();

  const cookie = (await page.context().cookies()).find((c) => c.name === "oc_session");
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", secure: true });
});

test("signing out from the sidebar ends the session", async ({ page, isMobile }) => {
  await page.goto("/login");
  await page.getByLabel("Mật khẩu").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "OC Studio" })).toBeVisible();

  if (isMobile) await page.getByRole("button", { name: "Thu gọn / mở rộng thanh bên" }).click();
  await page.getByRole("button", { name: "Đăng xuất" }).locator("visible=true").click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings$/);
});
