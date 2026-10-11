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
  if (role === "avatar") {
    // A new avatar always goes through the crop step; the default crop is the centred square.
    const dialog = page.getByRole("dialog", { name: "Cắt ảnh đại diện" });
    await expect(dialog.getByTestId("avatar-crop-preview")).toBeVisible();
    await dialog.getByRole("button", { name: "Lưu" }).click();
    return;
  }
  const dialog = page.getByRole("dialog", { name: "Xem trước ảnh" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Tải lên" }).click();
}

/** A real PNG of the given size (two colour halves), drawn by the browser. */
async function drawnPng(page: Page, width: number, height: number): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ([w, h]) => {
      const canvas = document.createElement("canvas");
      canvas.width = w!;
      canvas.height = h!;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#7c3aed";
      context.fillRect(0, 0, w!, h!);
      context.fillStyle = "#f59e0b";
      context.fillRect(w! / 2, 0, w! / 2, h!);
      return canvas.toDataURL("image/png");
    },
    [width, height],
  );
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
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
  // Visited pages stay mounted but hidden (Activity): check the visible copy.
  await expect(
    page.getByText("Chưa thuộc bộ sưu tập nào.").filter({ visible: true }),
  ).toBeVisible();
});

test("crops an avatar before saving and can re-crop it from the original", async ({
  page,
}, testInfo) => {
  const name = uniqueName("Cắt ảnh", testInfo.project.name);
  await createCharacter(page, name);
  const wide = await drawnPng(page, 400, 200);
  const avatar = page.getByRole("img", { name: `Ảnh đại diện của ${name}` });
  const file = { name: "rộng.png", mimeType: "image/png", buffer: wide };

  // Cancel: nothing is uploaded, the avatar stays empty.
  await page.getByTestId("upload-avatar").setInputFiles(file);
  let dialog = page.getByRole("dialog", { name: "Cắt ảnh đại diện" });
  await expect(dialog.getByTestId("avatar-crop-preview")).toBeVisible();
  await dialog.getByRole("button", { name: "Phóng to" }).click();
  await dialog.getByRole("button", { name: "Hủy" }).click();
  await expect(dialog).toBeHidden();
  await expect(avatar).toHaveCount(0);

  // Save the default (centred square of a 2:1 image): the frame shows half the width.
  await page.getByTestId("upload-avatar").setInputFiles(file);
  dialog = page.getByRole("dialog", { name: "Cắt ảnh đại diện" });
  await expect(dialog.getByTestId("avatar-crop-preview")).toBeVisible();
  await dialog.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã tải ảnh lên.").first()).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(avatar).toHaveAttribute("style", /width: ?200%/);
  await page.reload();
  await expect(avatar).toHaveAttribute("style", /width: ?200%/);

  // Re-crop from the stored source: zoom in, save, and the crop survives a reload.
  dialog = await openDialog(page, page.getByRole("button", { name: "Chỉnh vùng cắt" }));
  await expect(dialog.getByRole("heading", { name: "Chỉnh vùng cắt ảnh đại diện" })).toBeVisible();
  await expect(dialog.getByTestId("avatar-crop-preview")).toBeVisible();
  await dialog.getByRole("button", { name: "Phóng to" }).click();
  await dialog.getByRole("button", { name: "Phóng to" }).click();
  await dialog.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã cập nhật ảnh đại diện.")).toBeVisible();
  await page.reload();
  const width = await avatar.evaluate((img: HTMLImageElement) =>
    Number.parseFloat(img.style.width),
  );
  expect(width).toBeGreaterThan(250);

  // "Đặt lại" goes back to the centred square.
  dialog = await openDialog(page, page.getByRole("button", { name: "Chỉnh vùng cắt" }));
  await expect(dialog.getByTestId("avatar-crop-preview")).toBeVisible();
  await dialog.getByRole("button", { name: "Đặt lại" }).click();
  await dialog.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã cập nhật ảnh đại diện.").first()).toBeVisible();
  await expect(avatar).toHaveAttribute("style", /width: ?200%/);
});

test("shows whole reference images in a masonry layout without overlap", async ({
  page,
}, testInfo) => {
  await createCharacter(page, uniqueName("Ảnh tham khảo", testInfo.project.name));
  const sizes = [
    [300, 600],
    [600, 300],
    [400, 400],
    [500, 250],
  ] as const;
  for (const [index, [width, height]] of sizes.entries()) {
    await uploadImage(page, "reference", {
      name: `ref-${index}.png`,
      mimeType: "image/png",
      buffer: await drawnPng(page, width, height),
    });
    await expect(page.getByRole("button", { name: `Xem ảnh ${index + 1}` })).toBeVisible();
  }

  const gallery = page.getByTestId("reference-gallery");
  const tiles = gallery.locator(":scope > li");
  await expect(tiles).toHaveCount(sizes.length);
  // Let tiles finish moving into place.
  await expect
    .poll(async () => {
      const boxes = await tiles.evaluateAll((items) =>
        items.map((item) => item.getBoundingClientRect().toJSON() as DOMRect),
      );
      return boxes.every(
        (a, i) =>
          boxes.every(
            (b, j) =>
              i === j ||
              a.right <= b.left + 1 ||
              b.right <= a.left + 1 ||
              a.bottom <= b.top + 1 ||
              b.bottom <= a.top + 1,
          ) && Math.abs(a.height / a.width - sizes[i]![1] / sizes[i]![0]) < 0.02,
      );
    })
    .toBe(true);

  // The container grows to hold every tile; nothing overflows sideways.
  const fits = await gallery.evaluate((list) => {
    const box = list.getBoundingClientRect();
    return [...list.children].every((item) => {
      const tile = item.getBoundingClientRect();
      return tile.bottom <= box.bottom + 1 && tile.right <= box.right + 1;
    });
  });
  expect(fits).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
