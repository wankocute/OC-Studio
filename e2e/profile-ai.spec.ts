import { expect, test } from "@playwright/test";
import {
  insertCharacter,
  closeDatabase,
  readProfileSections,
  readRevisionKinds,
  readCharacter,
} from "./database";

test.afterAll(closeDatabase);
test("AI previews scoped facts, writes its text into the draft, and keeps the approved version/history", async ({
  page,
}, testInfo) => {
  const name = `AI ${testInfo.project.name} ${Date.now()}`;
  const id = await insertCharacter(name, {
    values: {
      "identity.age": { state: "specified", value: { value: 25, unit: "years" } },
      "identity.biological_sex": { state: "not_applicable" },
      "background.family": { state: "specified", value: "E2E_PRIVATE" },
    },
  });
  const before = await readCharacter(id);
  await page.goto(`/characters/${id}/profile`);
  await page.getByRole("button", { name: "Tạo hồ sơ", exact: true }).click();
  await expect(page.locator("[data-profile-workspace][data-ready]:visible")).toBeVisible();
  const editor = page.getByRole("textbox", { name: "Nội dung mục Giới thiệu", exact: true });
  await editor.fill("Bản nháp thủ công.");
  await expect(page.getByTestId("save-status").filter({ visible: true })).toHaveText(/Đã lưu/);
  await page.getByRole("button", { name: "Duyệt nội dung", exact: true }).click();
  await page.getByRole("button", { name: "Viết với AI", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Google có thể dùng nội dung gửi qua Free Tier/)).toBeVisible();
  await expect(dialog.getByTestId("ai-facts-preview")).toContainText("identity.age");
  // Sensitivity marks are retired: a fact once marked sensitive is sent like any other.
  await expect(dialog.getByTestId("ai-facts-preview")).toContainText("identity.biological_sex");
  // Facts outside the section's groups are still never sent.
  await expect(dialog.getByTestId("ai-facts-preview")).not.toContainText("E2E_PRIVATE");
  await dialog.getByRole("button", { name: "Tạo nội dung", exact: true }).click();
  // Once the job finishes its text goes straight into the draft (no "use as draft" step): it is
  // typed out, then the editor takes over with the saved text.
  await expect(dialog).not.toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/ghi vào bản nháp/)).toBeVisible();
  await expect(editor).toContainText("đề xuất AI", { timeout: 10_000 });
  const section = (await readProfileSections(id)).find((section) => section.key === "intro")!;
  expect(await readRevisionKinds(section.id)).toContain("restore");
  expect((await readCharacter(id)).facts).toEqual(before.facts);
  await page.getByRole("radio", { name: "Bản đã duyệt", exact: true }).click();
  await expect(page.getByTestId("approved-content").filter({ visible: true })).toContainText(
    "Bản nháp thủ công",
  );
});

test("provider failures leave manual editing usable; facts once marked sensitive are sent", async ({
  page,
}, testInfo) => {
  const id = await insertCharacter(`AI lỗi ${testInfo.project.name} ${Date.now()}`, {
    values: {
      "identity.age": { state: "specified", value: { value: 25, unit: "years" } },
      "identity.biological_sex": { state: "not_applicable" },
    },
  });
  await page.goto(`/characters/${id}/profile`);
  await page.getByRole("button", { name: "Tạo hồ sơ", exact: true }).click();
  await expect(page.locator("[data-profile-workspace][data-ready]:visible")).toBeVisible();
  await page.getByRole("button", { name: "Viết với AI", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await expect(dialog.getByTestId("ai-facts-preview")).toContainText("identity.biological_sex");
  await dialog.getByRole("textbox", { name: "Yêu cầu viết (tùy chọn)" }).fill("E2E_RATE_LIMIT");
  await dialog.getByRole("button", { name: "Tạo nội dung", exact: true }).click();
  // The dialog closes at once; the job fails on the server and its reason is shown on reopening.
  await expect(dialog).not.toBeVisible();
  const aiButton = page.getByTestId("section-ai-button").filter({ visible: true });
  await expect(aiButton).toHaveText("Viết với AI", { timeout: 30_000 });
  await aiButton.click();
  await expect(dialog.getByRole("alert")).toContainText("giới hạn lượt gọi");
  await dialog.getByRole("button", { name: "Tạo lại", exact: true }).click();
  await expect(dialog.getByTestId("ai-facts-preview")).toContainText("identity.biological_sex");
  await page.keyboard.press("Escape");
  const editor = page.getByRole("textbox", { name: "Nội dung mục Giới thiệu", exact: true });
  await editor.fill("Vẫn soạn thủ công được.");
  await expect(page.getByTestId("save-status").filter({ visible: true })).toHaveText(/Đã lưu/);
});

test("AI writing into a section keeps that section selected", async ({
  page,
  isMobile,
}, testInfo) => {
  test.skip(isMobile, "The section list is a sidebar on desktop only.");
  const id = await insertCharacter(`AI mục ${testInfo.project.name} ${Date.now()}`, {
    values: { "appearance.overview": { state: "specified", value: "Cao gầy." } },
  });
  await page.goto(`/characters/${id}/profile`);
  await page.getByRole("button", { name: "Tạo hồ sơ", exact: true }).click();
  await expect(page.locator("[data-profile-workspace][data-ready]:visible")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Các mục" })
    .getByRole("button", { name: /^Ngoại hình —/ })
    .click();
  const heading = page.getByRole("heading", { level: 2, name: "Ngoại hình", exact: true });
  await expect(heading).toBeVisible();
  await expect(page).toHaveURL(/[?&]section=appearance\b/);

  await page.getByRole("button", { name: "Viết với AI", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Tạo nội dung", exact: true }).click();
  await expect(dialog).not.toBeVisible({ timeout: 30_000 });
  // The finished text is written into the draft and the route refreshes; the workspace must
  // stay on the section that was being written.
  await expect(
    page.getByRole("textbox", { name: "Nội dung mục Ngoại hình", exact: true }),
  ).toContainText("đề xuất AI", { timeout: 30_000 });
  await expect(heading).toBeVisible();
});
