import { expect, test } from "@playwright/test";

const routes = [
  { path: "/", heading: "OC Studio" },
  { path: "/characters", heading: "Thư viện nhân vật" },
  { path: "/collections", heading: "Bộ sưu tập" },
  { path: "/templates", heading: "Mẫu hồ sơ" },
  { path: "/settings", heading: "Cài đặt" },
];

for (const { path, heading } of routes) {
  test(`renders ${path} without horizontal overflow`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("theme can be switched from settings", async ({ page }) => {
  await page.goto("/settings");
  const html = page.locator("html");

  await page.getByRole("radio", { name: "Tối" }).click();
  await expect(html).toHaveClass(/\bdark\b/);

  await page.getByRole("radio", { name: "Sáng" }).click();
  await expect(html).not.toHaveClass(/\bdark\b/);

  await page.reload();
  await expect(html).not.toHaveClass(/\bdark\b/);
  await expect(page.getByRole("radio", { name: "Sáng" })).toBeChecked();
});

test("navigation works from the sidebar", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) {
    await page.getByRole("button", { name: "Thu gọn / mở rộng thanh bên" }).click();
  }
  await page.getByRole("link", { name: "Thư viện nhân vật" }).first().click();
  await expect(page).toHaveURL(/\/characters$/);
  await expect(page.getByRole("heading", { level: 1, name: "Thư viện nhân vật" })).toBeVisible();
});

test("unimplemented actions are disabled, not fake", async ({ page }) => {
  await page.goto("/characters");
  await expect(page.getByRole("button", { name: "Tạo nhân vật" })).toBeDisabled();
  await expect(page.getByRole("searchbox", { name: "Tìm kiếm nhân vật" })).toBeDisabled();
});
