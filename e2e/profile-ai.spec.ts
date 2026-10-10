import { expect, test } from "@playwright/test";
import {
  insertCharacter,
  closeDatabase,
  readProfileSections,
  readRevisionKinds,
  readCharacter,
} from "./database";

test.afterAll(closeDatabase);
test("AI previews scoped facts, preserves draft until apply, and keeps the approved version/history", async ({
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
  await expect(dialog.getByTestId("ai-facts-preview")).not.toContainText("identity.biological_sex");
  await expect(dialog.getByTestId("ai-facts-preview")).not.toContainText("E2E_PRIVATE");
  await dialog.getByRole("button", { name: "Tạo nội dung", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Nội dung đề xuất" })).toBeVisible();
  expect(JSON.stringify((await readProfileSections(id))[0]?.draft)).toContain("Bản nháp thủ công");
  await dialog.getByRole("button", { name: "Dùng làm bản nháp", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(editor).toContainText("đề xuất AI");
  const section = (await readProfileSections(id)).find((section) => section.key === "intro")!;
  expect(await readRevisionKinds(section.id)).toContain("restore");
  expect((await readCharacter(id)).facts).toEqual(before.facts);
  await page.getByRole("radio", { name: "Bản đã duyệt", exact: true }).click();
  await expect(page.getByTestId("approved-content").filter({ visible: true })).toContainText(
    "Bản nháp thủ công",
  );
});

test("provider failures leave manual editing usable and regenerate clears sensitive permissions", async ({
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
  await dialog.getByRole("checkbox", { name: "identity.biological_sex", exact: true }).check();
  await expect(dialog.getByTestId("ai-facts-preview")).toContainText("identity.biological_sex");
  await dialog.getByRole("textbox", { name: "Yêu cầu viết (tùy chọn)" }).fill("E2E_RATE_LIMIT");
  await dialog.getByRole("button", { name: "Tạo nội dung", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("giới hạn lượt gọi");
  await dialog.getByRole("button", { name: "Tạo lại với quyền mới", exact: true }).click();
  await expect(dialog.getByTestId("ai-facts-preview")).not.toContainText("identity.biological_sex");
  await expect(
    dialog.getByRole("checkbox", { name: "identity.biological_sex", exact: true }),
  ).not.toBeChecked();
  await page.keyboard.press("Escape");
  const editor = page.getByRole("textbox", { name: "Nội dung mục Giới thiệu", exact: true });
  await editor.fill("Vẫn soạn thủ công được.");
  await expect(page.getByTestId("save-status").filter({ visible: true })).toHaveText(/Đã lưu/);
});
