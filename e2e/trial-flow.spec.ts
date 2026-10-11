import { expect, type Page, test } from "@playwright/test";

import { closeDatabase, insertCharacter } from "./database";

test.afterAll(closeDatabase);

/**
 * The MVP trial path end to end, on the E2E database and without calling any AI provider:
 * create a character → enter a fact → write and approve a profile section → change that fact →
 * see the review warning → open the print view.
 */
function uniqueName(prefix: string, project: string) {
  return `${prefix} ${project} ${Date.now().toString(36)}`;
}

const saveStatus = (page: Page) => page.getByTestId("save-status").filter({ visible: true });

async function expectSaved(page: Page) {
  await expect(saveStatus(page)).toHaveText(/Đã lưu/, { timeout: 20_000 });
}

async function setOverview(page: Page, id: string, text: string) {
  await page.goto(`/characters/${id}/edit?group=appearance`);
  await expect(page.locator("[data-fact-editor][data-ready]:visible")).toBeVisible();
  await page.getByRole("textbox", { name: "Ngoại hình tổng thể", exact: true }).fill(text);
  await expectSaved(page);
}

test("trial flow: facts, profile, approval, outdated warning and print", async ({
  page,
  context,
  isMobile,
}, testInfo) => {
  test.slow(); // the whole journey across five pages
  const name = uniqueName("Dùng thử", testInfo.project.name);

  // Create the character from the dashboard.
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Mở thư viện nhân vật" })).toBeVisible();
  await expect(async () => {
    await page.getByRole("button", { name: "Tạo nhân vật" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  const create = page.getByRole("dialog");
  await create.getByLabel("Tên hiển thị").fill(name);
  await create.getByRole("button", { name: "Tạo", exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop()!;

  // Enter a fact.
  await setOverview(page, id, "Tóc bạc, mắt hổ phách.");

  // Start the profile, write the appearance section and approve it.
  await page.goto(`/characters/${id}`);
  await page.getByRole("link", { name: "Mở hồ sơ chi tiết" }).click();
  await page.getByRole("button", { name: "Tạo hồ sơ" }).click();
  await expect(page.locator("[data-profile-workspace][data-ready]:visible")).toBeVisible();
  if (isMobile) {
    await page.getByRole("combobox", { name: "Chuyển tới mục" }).click();
    await page.getByRole("option", { name: /^Ngoại hình/ }).click();
  } else {
    await page
      .getByRole("navigation", { name: "Các mục" })
      .getByRole("button", { name: /^Ngoại hình —/ })
      .click();
  }
  await page.getByRole("textbox", { name: "Nội dung mục Ngoại hình" }).click();
  await page.keyboard.type("Cô có mái tóc bạc và đôi mắt màu hổ phách.");
  await expectSaved(page);
  await page.getByRole("button", { name: "Duyệt nội dung" }).click();
  await expect(page.getByTestId("section-status").filter({ visible: true })).toHaveText("Đã duyệt");

  // The character page shows progress and no warning yet.
  await page.goto(`/characters/${id}`);
  const progress = page.getByTestId("profile-progress").filter({ visible: true });
  await expect(progress).toContainText("1/9 mục đã duyệt");
  await expect(progress).not.toContainText("chưa duyệt");
  await expect(
    page.getByText(/Dữ kiện nguồn đã thay đổi sau khi duyệt/).filter({ visible: true }),
  ).toHaveCount(0);

  // Change the source fact: the approved text may now be outdated.
  await setOverview(page, id, "Tóc đen, mắt hổ phách.");
  await page.goto(`/characters/${id}`);
  await expect(
    page
      .getByText("Dữ kiện nguồn đã thay đổi sau khi duyệt ở: Ngoại hình.", { exact: false })
      .filter({ visible: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Mở hồ sơ để xem lại" }).click();
  await expect(page.locator("[data-profile-workspace][data-ready]:visible")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Ngoại hình", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByText(/Dữ kiện nguồn đã thay đổi sau khi duyệt: Ngoại hình tổng thể/)
      .filter({ visible: true }),
  ).toBeVisible();

  // Print the approved profile.
  await page.getByRole("button", { name: "In / Lưu PDF" }).click();
  const dialog = page.getByRole("dialog", { name: "In hoặc lưu PDF" });
  await expect(dialog).toContainText("1 mục sẽ được in.");
  const [printPage] = await Promise.all([
    context.waitForEvent("page"),
    dialog.getByRole("link", { name: "Mở bản in" }).click(),
  ]);
  const printed = printPage.getByTestId("print-document");
  await expect(printed.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(printed).toContainText("Cô có mái tóc bạc và đôi mắt màu hổ phách.");

  // Reading these pages changed nothing: the warning is still there and nothing was approved.
  await page.goto(`/characters/${id}`);
  await expect(page.getByTestId("profile-progress").filter({ visible: true })).toContainText(
    "1/9 mục đã duyệt",
  );
});

test("dashboard shows recent characters; settings show the AI configuration without secrets", async ({
  page,
}, testInfo) => {
  const name = uniqueName("Gần đây", testInfo.project.name);
  await insertCharacter(name);
  await page.goto("/");
  const recent = page.getByRole("region", { name: "Nhân vật gần đây" });
  // At most five recent characters (other tests create more in parallel).
  await expect(page.getByRole("heading", { name: "Nhân vật gần đây" })).toBeVisible();
  const cards = recent.locator(":scope > ul > li");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeLessThanOrEqual(5);

  await expect(page.locator("body")).not.toContainText("postgresql://");

  // The app status (database, AI) lives on the settings page.
  await page.goto("/settings");
  const ai = page.locator("dl > div").filter({ hasText: "Trợ lý AI" });
  await expect(ai).toContainText(/Đã cấu hình|Chưa cấu hình/);
  await expect(ai).toContainText(/Gemini|OpenAI/);
  // Keys are never shown, whatever the local configuration is.
  await expect(ai).not.toContainText(/AIza|sk-|API_KEY=/);
  await expect(page.locator("body")).not.toContainText("postgresql://");
});
