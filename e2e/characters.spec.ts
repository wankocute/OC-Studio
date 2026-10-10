import { expect, type Page, test } from "@playwright/test";

const COLLECTION_URL = /\/collections\/[0-9a-f-]{36}$/;

/** 1×1 PNG. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Click a trigger until its dialog opens: right after navigation the button can be visible
 * before React has hydrated it.
 */
async function openDialog(
  page: Page,
  trigger: ReturnType<Page["getByRole"]>,
  role: "dialog" | "alertdialog" = "dialog",
) {
  await expect(async () => {
    await trigger.click();
    await expect(page.getByRole(role)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  return page.getByRole(role);
}

/** Unique per test and project, so parallel tests never see each other's data. */
function uniqueName(prefix: string, project: string) {
  return `${prefix} ${project} ${Date.now().toString(36)}`;
}

async function createCharacter(
  page: Page,
  name: string,
  extra: { fullName?: string; age?: string } = {},
) {
  await page.goto("/characters");
  const dialog = await openDialog(page, page.getByRole("button", { name: "Tạo nhân vật" }).first());
  await dialog.getByLabel("Tên hiển thị").fill(name);
  if (extra.fullName) await dialog.getByLabel("Họ tên đầy đủ").fill(extra.fullName);
  if (extra.age) await dialog.getByLabel("Tuổi", { exact: true }).fill(extra.age);
  await dialog.getByRole("button", { name: "Tạo", exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return page.url();
}

async function uploadImage(
  page: Page,
  role: "avatar" | "reference",
  file: { name: string; mimeType: string; buffer: Buffer },
) {
  await page.getByTestId(`upload-${role}`).setInputFiles(file);
  const dialog = page.getByRole("dialog", { name: "Xem trước ảnh" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Tải lên" }).click();
}

test("create, view, edit, favourite, tag, upload, search and delete a character", async ({
  page,
}, testInfo) => {
  const name = uniqueName("Ngọc", testInfo.project.name);
  const detailUrl = await createCharacter(page, name, { fullName: "Trần Bảo Ngọc", age: "27" });

  // Basic info shows only what was entered; the rest is "Chưa xác định".
  const basicInfo = page.locator("dl").filter({ hasText: "Họ tên đầy đủ" });
  await expect(basicInfo).toContainText("Trần Bảo Ngọc");
  await expect(basicInfo).toContainText("27 tuổi");
  await expect(basicInfo).toContainText("Chưa xác định");

  // Edit basic info.
  const dialog = await openDialog(page, page.getByRole("button", { name: "Chỉnh sửa" }));
  await dialog.getByLabel("Nghề nghiệp").fill("Họa sĩ minh họa");
  await dialog.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã lưu thay đổi.")).toBeVisible();
  await expect(basicInfo).toContainText("Họa sĩ minh họa");

  // Favourite.
  await page.getByRole("button", { name: "Thêm vào yêu thích" }).click();
  await expect(page.getByRole("button", { name: "Bỏ yêu thích" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Tag (created on the fly).
  const tag = uniqueName("thẻ", testInfo.project.name);
  await expect(async () => {
    await page.getByRole("button", { name: "Gắn thẻ" }).click();
    await expect(page.getByPlaceholder("Tìm hoặc tạo thẻ…")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByPlaceholder("Tìm hoặc tạo thẻ…").fill(tag);
  await page.getByRole("option", { name: `Tạo thẻ “${tag}”` }).click();
  await expect(page.getByRole("list", { name: "Thẻ" })).toContainText(tag);

  // Avatar and reference image.
  await uploadImage(page, "avatar", { name: "avatar.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("Đã tải ảnh lên.").first()).toBeVisible();
  await expect(page.getByRole("img", { name: `Ảnh đại diện của ${name}` })).toHaveAttribute(
    "src",
    /\/media\//,
  );
  await uploadImage(page, "reference", {
    name: "phác thảo.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(page.getByRole("button", { name: "Xem ảnh 1" })).toBeVisible();

  // Everything survives a reload.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(basicInfo).toContainText("Họa sĩ minh họa");
  await expect(page.getByRole("list", { name: "Thẻ" })).toContainText(tag);
  await expect(page.getByRole("button", { name: "Bỏ yêu thích" })).toBeVisible();

  // The image route serves the stored file with a safe content type.
  const src = await page.getByRole("img", { name: `Ảnh đại diện của ${name}` }).getAttribute("src");
  const response = await page.request.get(src!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");

  // Library: search, favourites filter and tag on the card.
  await page.goto(`/characters?q=${encodeURIComponent(name)}`);
  await expect(page.getByRole("link", { name })).toBeVisible();
  await page.goto(`/characters?favorites=1&q=${encodeURIComponent(name)}`);
  await expect(page.getByRole("link", { name })).toBeVisible();
  await expect(page.getByText(tag)).toBeVisible();

  // Delete with confirmation.
  await page.goto(detailUrl);
  const confirm = await openDialog(
    page,
    page.getByRole("button", { name: "Xóa", exact: true }),
    "alertdialog",
  );
  await confirm.getByRole("button", { name: "Xóa nhân vật" }).click();
  await expect(page).toHaveURL(/\/characters$/);
  await expect(page.getByText("Đã xóa nhân vật.")).toBeVisible();
  await page.goto(`/characters?q=${encodeURIComponent(name)}`);
  await expect(page.getByText("Không có nhân vật phù hợp")).toBeVisible();
  await page.goto(detailUrl);
  await expect(page.getByText("Không tìm thấy nhân vật")).toBeVisible();
});

test("requires a display name", async ({ page }) => {
  await page.goto("/characters");
  const dialog = await openDialog(page, page.getByRole("button", { name: "Tạo nhân vật" }).first());
  await dialog.getByLabel("Tên hiển thị").fill("   ");
  await dialog.getByRole("button", { name: "Tạo", exact: true }).click();
  await expect(dialog.getByText("Hãy nhập tên hiển thị.")).toBeVisible();
  await expect(page).toHaveURL(/\/characters$/);
});

test("searches and sorts the library", async ({ page }, testInfo) => {
  const prefix = uniqueName("Sắp xếp", testInfo.project.name);
  await createCharacter(page, `${prefix} Bình`);
  await createCharacter(page, `${prefix} An`);

  await page.goto(`/characters?q=${encodeURIComponent(prefix)}&sort=name&view=list`);
  const links = page.getByRole("link", { name: new RegExp(prefix) });
  await expect(links).toHaveText([`${prefix} An`, `${prefix} Bình`]);

  await page.goto(`/characters?q=${encodeURIComponent(prefix)}&sort=created&view=list`);
  await expect(links).toHaveText([`${prefix} An`, `${prefix} Bình`]); // newest first

  await page.goto(`/characters?q=${encodeURIComponent(prefix)}&sort=updated`);
  await expect(page.getByText("2 nhân vật")).toBeVisible();
});

test("rejects a file that is not really an image", async ({ page }, testInfo) => {
  await createCharacter(page, uniqueName("Ảnh giả", testInfo.project.name));
  await uploadImage(page, "reference", {
    name: "fake.png",
    mimeType: "image/png",
    buffer: Buffer.from("<svg onload=alert(1)></svg>"),
  });
  await expect(page.getByText("Tệp không phải ảnh PNG, JPEG, WebP hoặc GIF hợp lệ.")).toBeVisible();
  await expect(page.getByText("Chưa có ảnh tham khảo.")).toBeVisible();
});

test("refuses to overwrite changes made elsewhere", async ({ browser }, testInfo) => {
  const context = await browser.newContext();
  const first = await context.newPage();
  const name = uniqueName("Xung đột", testInfo.project.name);
  const url = await createCharacter(first, name);
  const second = await context.newPage();
  await second.goto(url);
  await expect(second.getByRole("heading", { level: 1, name })).toBeVisible();

  const firstDialog = await openDialog(first, first.getByRole("button", { name: "Chỉnh sửa" }));
  await firstDialog.getByLabel("Chủng loài").fill("Người");
  await firstDialog.getByRole("button", { name: "Lưu" }).click();
  await expect(first.getByText("Đã lưu thay đổi.")).toBeVisible();

  // The second tab still holds the old revision.
  const secondDialog = await openDialog(second, second.getByRole("button", { name: "Chỉnh sửa" }));
  await secondDialog.getByLabel("Chủng loài").fill("Tinh linh");
  await secondDialog.getByRole("button", { name: "Lưu" }).click();
  await expect(secondDialog.getByRole("alert")).toContainText("đã được thay đổi ở nơi khác");
  // Saving stale values is blocked; the user loads the latest data instead.
  await expect(secondDialog.getByRole("button", { name: "Lưu" })).toHaveCount(0);
  await secondDialog.getByRole("button", { name: "Tải dữ liệu mới nhất" }).click();
  await expect(secondDialog.getByLabel("Chủng loài")).toHaveValue("Người");
  await expect(secondDialog.getByRole("alert")).toHaveCount(0);

  await second.reload();
  await expect(second.locator("dl").filter({ hasText: "Chủng loài" })).toContainText("Người");
  await context.close();
});

test("collections group characters and can be deleted without losing them", async ({
  page,
}, testInfo) => {
  const character = uniqueName("Thành viên", testInfo.project.name);
  const url = await createCharacter(page, character);
  const collection = uniqueName("Thế giới", testInfo.project.name);

  await page.goto("/collections");
  const createDialog = await openDialog(
    page,
    page.getByRole("button", { name: "Tạo bộ sưu tập" }).first(),
  );
  await createDialog.getByLabel("Tên bộ sưu tập").fill(collection);
  await createDialog.getByRole("button", { name: "Tạo", exact: true }).click();
  await expect(page.getByText("Đã tạo bộ sưu tập.")).toBeVisible();

  await page.getByRole("link", { name: collection }).click();
  await expect(page).toHaveURL(COLLECTION_URL);
  await expect(page.getByRole("heading", { level: 1, name: collection })).toBeVisible();
  await expect(async () => {
    await page.getByRole("button", { name: "Thêm nhân vật" }).click();
    await expect(page.getByPlaceholder("Tìm nhân vật…")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByPlaceholder("Tìm nhân vật…").fill(character);
  await page.getByRole("option", { name: character }).click();
  await expect(page.getByRole("link", { name: character })).toBeVisible();

  // The character page lists the collection.
  await page.goto(url);
  await expect(page.getByRole("list", { name: "Thuộc bộ sưu tập" })).toContainText(collection);

  // Delete the collection: the character remains.
  await page.getByRole("link", { name: collection }).click();
  await expect(page).toHaveURL(COLLECTION_URL);
  await expect(page.getByRole("heading", { level: 1, name: collection })).toBeVisible();
  const confirm = await openDialog(
    page,
    page.getByRole("button", { name: "Xóa", exact: true }),
    "alertdialog",
  );
  await expect(confirm).toContainText(collection);
  await confirm.getByRole("button", { name: "Xóa", exact: true }).click();
  await expect(page).toHaveURL(/\/collections$/);
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1, name: character })).toBeVisible();
  await expect(page.getByText("Chưa thuộc bộ sưu tập nào.")).toBeVisible();
});
