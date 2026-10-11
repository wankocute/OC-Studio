import { expect, type Locator, type Page, test } from "@playwright/test";

import { closeDatabase, insertCharacter, readCharacter } from "./database";

test.afterAll(closeDatabase);

/** Unique per test and project, so parallel tests never see each other's data. */
function uniqueName(prefix: string, project: string) {
  return `${prefix} ${project} ${Date.now().toString(36)}`;
}

/** Hidden copies of visited pages stay in the DOM (Activity), so only the visible editor counts. */
const READY = "[data-fact-editor][data-ready]:visible";

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function openEditor(page: Page, id: string, query = "") {
  await page.goto(`/characters/${id}/edit${query}`);
  await expect(page.locator(READY)).toBeVisible();
}

/** Both layouts use the same tree; mobile first opens its disclosure. */
async function goToGroup(page: Page, label: string, isMobile: boolean, heading = label) {
  if (isMobile) {
    await page.getByRole("button", { name: /^Chuyển tới nhóm:/ }).click();
  }
  await page
    .getByRole("navigation", { name: "Nhóm dữ kiện" })
    .getByRole("button", { name: new RegExp(`^${escape(label)}( \\d+)?$`) })
    .click();
  await expect(page.getByRole("heading", { level: 2, name: heading, exact: true })).toBeVisible();
}

const field = (scope: Page | Locator, label: string) =>
  scope.getByRole("group", { name: label, exact: true });
// Fields are groups labelled like their input, so inputs are located by role, not by label.
const textbox = (scope: Page | Locator, label: string) =>
  scope.getByRole("textbox", { name: label, exact: true });
const combobox = (scope: Page | Locator, label: string) =>
  scope.getByRole("combobox", { name: label, exact: true });

const status = (page: Page) => page.getByTestId("save-status").filter({ visible: true });

async function expectSaved(page: Page) {
  await expect(status(page)).toHaveText(/Đã lưu/, { timeout: 20_000 });
}

async function chooseOption(page: Page, trigger: Locator, option: string) {
  await trigger.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function setState(page: Page, fieldLabel: string, state: string) {
  await page.getByRole("button", { name: `Trạng thái của ${fieldLabel}`, exact: true }).click();
  await page.getByRole("menuitemradio", { name: state }).click();
}

test("edits many field kinds and special states, and keeps them after reload", async ({
  page,
  isMobile,
}, testInfo) => {
  const id = await insertCharacter(uniqueName("Kiểu trường", testInfo.project.name));
  await openEditor(page, id);
  await goToGroup(page, "Định danh", isMobile);

  await textbox(page, "Họ tên đầy đủ").fill("Lâm Thanh Vân");
  const nicknames = field(page, "Biệt danh");
  await nicknames.getByRole("button", { name: "Thêm mục" }).click();
  await nicknames.getByRole("textbox").first().fill("Vân");
  await nicknames.getByRole("textbox").first().press("Enter");
  await nicknames.getByRole("textbox").nth(1).fill("Mây");
  await textbox(page, "Tuổi").fill("0");
  const birth = field(page, "Ngày sinh");
  await textbox(birth, "Ngày").fill("14");
  await chooseOption(page, combobox(birth, "Tháng"), "3");
  await textbox(birth, "Năm").fill("-120");
  await chooseOption(page, combobox(page, "Bản dạng giới"), "Khác…");
  await field(page, "Bản dạng giới").getByRole("textbox").fill("Linh hồn gió");

  // Detailed fields (always shown) and the special states.
  await setState(page, "Quốc tịch", "Xác nhận không có");
  await setState(page, "Tuổi trông như", "Không áp dụng");
  await expect(field(page, "Quốc tịch")).toContainText(
    "Bạn đã xác nhận nhân vật không có điều này.",
  );
  // Only fields that allow it offer "explicit none".
  await page.getByRole("button", { name: "Trạng thái của Tuổi trông như", exact: true }).click();
  await expect(page.getByRole("menuitemradio", { name: "Xác nhận không có" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await goToGroup(page, "Hành vi và giao tiếp", isMobile);
  await chooseOption(page, combobox(page, "Tốc độ nói"), "Chậm");
  await expectSaved(page);

  const stored = await readCharacter(id);
  expect(stored.facts.values["identity.full_name"]).toEqual({
    state: "specified",
    value: "Lâm Thanh Vân",
  });
  expect(stored.facts.values["identity.nicknames"]?.value).toMatchObject([
    { text: "Vân" },
    { text: "Mây" },
  ]);
  // 0 is a real value, not "unspecified".
  expect(stored.facts.values["identity.age"]?.value).toEqual({ value: 0, unit: "years" });
  expect(stored.facts.values["identity.birth_date"]?.value).toEqual({
    type: "calendar",
    day: 14,
    month: 3,
    year: -120,
  });
  expect(stored.facts.values["identity.gender_identity"]?.value).toEqual({ other: "Linh hồn gió" });
  expect(stored.facts.values["identity.nationality"]).toEqual({ state: "explicit_none" });
  expect(stored.facts.values["identity.apparent_age"]).toEqual({ state: "not_applicable" });
  expect(stored.facts.values["behavior.speech_pace"]?.value).toEqual({ option: "slow" });
  // Untouched fields are never written as "unspecified".
  expect(stored.facts.values["identity.common_name"]).toBeUndefined();

  await page.reload();
  await expect(page.locator(READY)).toBeVisible();
  await goToGroup(page, "Định danh", isMobile);
  await expect(textbox(page, "Họ tên đầy đủ")).toHaveValue("Lâm Thanh Vân");
  await expect(nicknames.getByRole("textbox").nth(1)).toHaveValue("Mây");
  await expect(textbox(page, "Tuổi")).toHaveValue("0");
  await expect(field(page, "Tuổi trông như")).toContainText(
    "Khái niệm này không áp dụng cho nhân vật.",
  );
});

test("list items keep stable ids and per-item sensitivity through reorder and reload", async ({
  page,
  isMobile,
}, testInfo) => {
  const id = await insertCharacter(uniqueName("Danh sách", testInfo.project.name));
  await openEditor(page, id);
  await goToGroup(page, "Ngoại hình", isMobile);

  const features = field(page, "Đặc điểm đặc biệt");
  await features.getByRole("button", { name: "Thêm mục" }).click();
  await textbox(features, "Đặc điểm").first().fill("Đôi cánh");
  await features.getByRole("button", { name: "Thêm mục" }).click();
  await textbox(features, "Đặc điểm").nth(1).fill("Vảy bạc");
  await features.getByRole("button", { name: "Đánh dấu nhạy cảm: Vảy bạc" }).click();
  await expectSaved(page);

  const before = (await readCharacter(id)).facts.values["appearance.special_features"]!;
  const [wings, scales] = before.value as { id: string; name: string }[];
  expect(before.sensitiveItemIds).toEqual([scales!.id]);

  await features.getByRole("button", { name: "Đưa Vảy bạc lên" }).click();
  await expectSaved(page);
  const after = (await readCharacter(id)).facts.values["appearance.special_features"]!;
  expect(after.value).toEqual([scales, wings]);
  expect(after.sensitiveItemIds).toEqual([scales!.id]);

  await page.reload();
  await expect(page.locator(READY)).toBeVisible();
  await goToGroup(page, "Ngoại hình", isMobile);
  await expect(
    features.getByRole("button", { name: "Đánh dấu nhạy cảm: Vảy bạc" }),
  ).toHaveAttribute("aria-pressed", "true");

  // Removing a sensitive item asks first, then removes the item and its mark together.
  await features.getByRole("button", { name: "Xóa Vảy bạc" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Xóa mục" }).click();
  await expectSaved(page);
  const removed = (await readCharacter(id)).facts.values["appearance.special_features"]!;
  expect(removed.value).toEqual([wings]);
  expect(removed.sensitiveItemIds).toBeUndefined();
});

test("relationships link library characters or unlinked names, suggest the reverse and survive deletion", async ({
  page,
  isMobile,
}, testInfo) => {
  test.slow(); // many steps across several pages
  const project = testInfo.project.name;
  const aName = uniqueName("Quan hệ A", project);
  const bName = uniqueName("Quan hệ B", project);
  const a = await insertCharacter(aName);
  const b = await insertCharacter(bName);

  await openEditor(page, a);
  await goToGroup(page, "Quan hệ nhân vật", isMobile);
  const entries = field(page, "Các mối quan hệ");
  await entries.getByRole("button", { name: "Thêm mục" }).click();
  await entries.getByRole("button", { name: "Nhân vật: Chọn nhân vật" }).click();
  await page.getByPlaceholder("Tìm OC hoặc nhập tên…").fill(bName);
  await page.getByRole("option", { name: bName, exact: true }).click();
  await chooseOption(page, combobox(entries, "Loại quan hệ"), "Bạn bè");

  await entries.getByRole("button", { name: "Thêm mục" }).click();
  await entries.getByRole("button", { name: "Nhân vật: Chọn nhân vật" }).click();
  await page.getByPlaceholder("Tìm OC hoặc nhập tên…").fill("Bà ngoại Tư");
  await page.getByRole("option", { name: "Nhân vật chưa có hồ sơ: “Bà ngoại Tư”" }).click();
  await expectSaved(page);

  const stored = (await readCharacter(a)).facts.values["relationships.entries"]!.value as {
    person: unknown;
    type?: unknown;
  }[];
  expect(stored.map((entry) => entry.person)).toEqual([
    { type: "character", characterId: b },
    { type: "unlinked", name: "Bà ngoại Tư" },
  ]);
  expect(stored[0]!.type).toEqual({ option: "friend" });
  // Nothing was created on B automatically.
  expect((await readCharacter(b)).facts.values["relationships.entries"]).toBeUndefined();

  // Following the suggestion pre-fills only the person on B; the type is left to the user.
  await page.getByRole("link", { name: `Thêm quan hệ ở hồ sơ ${bName}` }).click();
  await expect(page).toHaveURL(new RegExp(`/characters/${b}/edit`));
  await expect(page.locator(READY)).toBeVisible();
  await expect(page.getByText(`Đã thêm một quan hệ tới ${aName}`)).toBeVisible();
  await expectSaved(page);
  const reverse = (await readCharacter(b)).facts.values["relationships.entries"]!.value as {
    person: unknown;
    type?: unknown;
  }[];
  expect(reverse).toHaveLength(1);
  expect(reverse[0]!.person).toEqual({ type: "character", characterId: a });
  expect(reverse[0]!.type).toBeUndefined();

  // Deleting B turns A's link into an unlinked name; the relationship itself is kept.
  await page.goto(`/characters/${b}`);
  await expect(async () => {
    await page.getByRole("button", { name: "Xóa", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("alertdialog").getByRole("button", { name: "Xóa nhân vật" }).click();
  await expect(page).toHaveURL(/\/characters$/);

  await openEditor(page, a, "?group=relationships");
  await expect(entries.getByText("Hồ sơ gốc đã bị xóa")).toBeVisible();
  await expect(textbox(entries, "Tên nhân vật").first()).toHaveValue(bName);
  const detached = (await readCharacter(a)).facts.values["relationships.entries"]!.value as {
    person: { type: string; detachedFrom?: { characterId: string } };
    type?: unknown;
  }[];
  expect(detached[0]!.person.type).toBe("unlinked");
  expect(detached[0]!.person.detachedFrom?.characterId).toBe(b);
  expect(detached[0]!.type).toEqual({ option: "friend" });
});

test("character-scoped and library-scoped custom fields", async ({ page, isMobile }, testInfo) => {
  test.slow(); // many steps across several pages
  const project = testInfo.project.name;
  const id = await insertCharacter(uniqueName("Tùy chỉnh", project));
  const zodiac = `Cung hoàng đạo ${project} ${Date.now().toString(36)}`;
  await openEditor(page, id);
  await goToGroup(page, "Trường tùy chỉnh", isMobile);

  // Character scope.
  await page.getByRole("button", { name: "Thêm trường", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tên trường").fill("Món ăn yêu thích");
  await dialog.getByRole("button", { name: "Thêm trường", exact: true }).click();
  await expect(dialog).toBeHidden();

  // Library scope, with options.
  await page.getByRole("button", { name: "Tạo trường dùng chung" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tên trường").fill(zodiac);
  await chooseOption(page, dialog.getByLabel("Kiểu dữ liệu"), "Chọn một");
  await dialog.getByRole("button", { name: "Thêm lựa chọn" }).click();
  await textbox(dialog, "Lựa chọn 1").fill("Bạch Dương");
  await dialog.getByRole("button", { name: "Thêm lựa chọn" }).click();
  await textbox(dialog, "Lựa chọn 2").fill("Kim Ngưu");
  await dialog.getByRole("button", { name: "Thêm trường", exact: true }).click();
  await expect(dialog).toBeHidden();

  await goToGroup(page, "Định danh", isMobile);
  await expect(field(page, "Món ăn yêu thích")).toContainText("Riêng nhân vật");
  await textbox(page, "Món ăn yêu thích").fill("Phở");
  await chooseOption(page, combobox(page, zodiac), "Kim Ngưu");
  await expectSaved(page);

  const stored = await readCharacter(id);
  const custom = stored.facts.custom!.fields[0]!;
  expect(custom.label).toBe("Món ăn yêu thích");
  expect(stored.facts.values[custom.key]).toEqual({ state: "specified", value: "Phở" });
  const libraryKey = Object.keys(stored.facts.values).find((key) => key.startsWith("lib."))!;
  expect(stored.facts.values[libraryKey]?.value).toHaveProperty("option");

  await page.reload();
  await expect(page.locator(READY)).toBeVisible();
  await goToGroup(page, "Định danh", isMobile);
  await expect(textbox(page, "Món ăn yêu thích")).toHaveValue("Phở");

  // Library page: a used definition cannot be deleted, only deprecated.
  await page.goto("/fields");
  const row = page.getByRole("listitem").filter({ hasText: zodiac });
  await expect(row).toContainText("1 nhân vật đang dùng");
  await expect(row.getByRole("button", { name: `Xóa ${zodiac}` })).toBeDisabled();
  await expect(async () => {
    await row.getByRole("button", { name: "Ngừng sử dụng" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("alertdialog").getByRole("button", { name: "Ngừng sử dụng" }).click();
  await expect(row.getByRole("button", { name: "Ngừng sử dụng" })).toHaveCount(0);
  await expect(row).toContainText("Ngừng sử dụng");

  // A deprecated definition is not offered to other characters, but stays on this one.
  const other = await insertCharacter(uniqueName("Tùy chỉnh khác", project));
  await openEditor(page, other);
  await goToGroup(page, "Trường tùy chỉnh", isMobile);
  await page.getByRole("button", { name: "Dùng trường dùng chung" }).click();
  await expect(page.getByRole("option", { name: zodiac })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await openEditor(page, id);
  await goToGroup(page, "Định danh", isMobile);
  await expect(field(page, zodiac)).toContainText("Ngừng sử dụng");
});

test("revision conflict between two tabs never overwrites silently", async ({
  page,
  context,
  isMobile,
}, testInfo) => {
  test.slow(); // many steps across several pages
  const id = await insertCharacter(uniqueName("Xung đột", testInfo.project.name));
  const other = await context.newPage();
  await openEditor(page, id);
  await openEditor(other, id);
  await goToGroup(page, "Định danh", isMobile);
  await goToGroup(other, "Định danh", isMobile);

  await textbox(page, "Họ tên đầy đủ").fill("Từ tab một");
  await expectSaved(page);

  // Different fields: "keep mine" merges without asking.
  await textbox(other, "Đại từ xưng hô").fill("cô ấy");
  await expect(status(other)).toHaveText("Xung đột chỉnh sửa");
  await other.getByRole("button", { name: "Giữ thay đổi của tôi" }).click();
  await expectSaved(other);
  let stored = await readCharacter(id);
  expect(stored.facts.values["identity.full_name"]?.value).toBe("Từ tab một");
  expect(stored.facts.values["identity.pronouns"]?.value).toBe("cô ấy");

  // Same field: the overlap is listed and needs confirmation.
  await page.reload();
  await expect(page.locator(READY)).toBeVisible();
  await goToGroup(page, "Định danh", isMobile);
  await textbox(page, "Họ tên đầy đủ").fill("Bản của tab một");
  await expectSaved(page);
  await textbox(other, "Họ tên đầy đủ").fill("Bản của tab hai");
  await expect(status(other)).toHaveText("Xung đột chỉnh sửa");
  await other.getByRole("button", { name: "Giữ thay đổi của tôi" }).click();
  const confirm = other.getByRole("alertdialog");
  await expect(confirm).toContainText("Họ tên đầy đủ");
  await confirm.getByRole("button", { name: "Dùng phiên bản của tôi" }).click();
  await expectSaved(other);
  expect((await readCharacter(id)).facts.values["identity.full_name"]?.value).toBe(
    "Bản của tab hai",
  );

  // Or discard local changes and load the latest version.
  await page.reload();
  await expect(page.locator(READY)).toBeVisible();
  await goToGroup(page, "Định danh", isMobile);
  await textbox(page, "Chủng loài").fill("Rồng");
  await expectSaved(page);
  await textbox(other, "Đại từ xưng hô").fill("nó");
  await expect(status(other)).toHaveText("Xung đột chỉnh sửa");
  await other.getByRole("button", { name: "Tải bản mới nhất" }).click();
  await other
    .getByRole("alertdialog")
    .getByRole("button", { name: "Bỏ thay đổi và tải lại" })
    .click();
  await expect(textbox(other, "Chủng loài")).toHaveValue("Rồng");
  await expect(textbox(other, "Đại từ xưng hô")).toHaveValue("cô ấy");
  stored = await readCharacter(id);
  expect(stored.facts.values["identity.pronouns"]?.value).toBe("cô ấy");
});

test("migration review must be confirmed before an old sheet is saved", async ({
  page,
  isMobile,
}, testInfo) => {
  test.slow(); // many steps across several pages
  const name = uniqueName("Dữ liệu cũ", testInfo.project.name);
  const id = await insertCharacter(
    name,
    {
      values: {
        "identity.full_name": { state: "specified", value: "Tên cũ" },
        "identity.gender": { state: "specified", value: { option: "female" } },
        "identity.family_name": { state: "not_applicable" },
      },
    },
    1,
  );

  // Basic-info edits are blocked too, so the review is never dropped silently.
  await page.goto(`/characters/${id}`);
  await expect(page.getByText("Hồ sơ được lưu bằng định dạng cũ")).toBeVisible();
  await expect(async () => {
    await page.getByRole("button", { name: "Chỉnh sửa" }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("dialog").getByLabel("Nghề nghiệp").fill("Thợ rèn");
  await page.getByRole("dialog").getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Hồ sơ còn dữ liệu cũ cần xem lại",
  );
  await page.getByRole("dialog").getByRole("button", { name: "Hủy" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.getByRole("link", { name: "Xem lại trong trình biên tập" }).click();
  await expect(page.locator(READY)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Xem lại dữ liệu từ định dạng cũ" }),
  ).toBeVisible();

  await goToGroup(page, "Định danh", isMobile);
  await expect(field(page, "Giới tính (dữ liệu cũ)")).toContainText("Nữ");
  await textbox(page, "Họ tên đầy đủ").fill("Tên mới");
  await expect(status(page)).toHaveText("Chờ xác nhận dữ liệu cũ");
  await page.waitForTimeout(2_000);
  expect((await readCharacter(id)).schemaVersion).toBe(1);

  await goToGroup(page, "Cần xem lại", isMobile, "Xem lại dữ liệu từ định dạng cũ");
  const confirm = page.getByRole("button", { name: "Xác nhận đã xem lại" });
  await expect(confirm).toBeDisabled();
  await page
    .getByRole("radiogroup", { name: "Cách xử lý: Họ" })
    .getByLabel("Đổi thành “Xác nhận không có”")
    .check();
  await page
    .getByRole("radiogroup", { name: "Cách xử lý: Giới tính (dữ liệu cũ)" })
    .getByLabel("Giữ giá trị cũ")
    .check();
  await confirm.click();
  await expectSaved(page);

  const stored = await readCharacter(id);
  expect(stored.schemaVersion).toBe(3);
  expect(stored.facts.values["identity.family_name"]).toEqual({ state: "explicit_none" });
  expect(stored.facts.values["identity.gender"]?.value).toEqual({ option: "female" });
  expect(stored.facts.values["identity.full_name"]?.value).toBe("Tên mới");

  await page.reload();
  await expect(page.locator(READY)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Xem lại dữ liệu từ định dạng cũ" })).toHaveCount(
    0,
  );
});

test("source language, validation feedback and unsaved-change guard", async ({
  page,
  isMobile,
}, testInfo) => {
  const id = await insertCharacter(uniqueName("Ngôn ngữ", testInfo.project.name));
  await openEditor(page, id);

  await chooseOption(page, page.getByLabel("Ngôn ngữ nguồn"), "Ngôn ngữ khác…");
  await page.getByLabel("Mã ngôn ngữ (BCP 47)").fill("pt-br");
  await expect(page.getByText(/Nhận diện:/)).toBeVisible();
  await expectSaved(page);
  expect((await readCharacter(id)).facts.sourceLanguage).toBe("pt-BR");

  await page.getByLabel("Mã ngôn ngữ (BCP 47)").fill("không-hợp-lệ");
  await expect(status(page)).toHaveText("Chưa lưu — có trường chưa hợp lệ");
  await chooseOption(page, page.getByLabel("Ngôn ngữ nguồn"), "Chưa xác định");
  await expectSaved(page);
  expect((await readCharacter(id)).facts.sourceLanguage).toBeUndefined();

  // Invalid input stays in the box with a message next to it; nothing is saved.
  await goToGroup(page, "Ngoại hình", isMobile);
  await textbox(page, "Chiều cao").fill("abc");
  await expect(field(page, "Chiều cao")).toContainText("Hãy nhập một số hợp lệ.");
  await expect(status(page)).toHaveText("Chưa lưu — có trường chưa hợp lệ");
  await expect(textbox(page, "Chiều cao")).toHaveValue("abc");
  expect((await readCharacter(id)).facts.values["appearance.height"]).toBeUndefined();
  await textbox(page, "Chiều cao").fill("172,5");
  await expectSaved(page);
  expect((await readCharacter(id)).facts.values["appearance.height"]?.value).toEqual({
    value: 172.5,
    unit: "cm",
  });

  // Leaving with unsaved changes asks first.
  await textbox(page, "Màu tóc").fill("Bạc");
  let asked = false;
  page.once("dialog", (dialog) => {
    asked = true;
    void dialog.dismiss();
  });
  await page.getByRole("link", { name: "Về hồ sơ" }).click();
  expect(asked).toBe(true);
  await expect(page).toHaveURL(new RegExp(`/characters/${id}/edit`));
  await expectSaved(page);
});

test("basic info from the library dialog stays intact while editing other facts", async ({
  page,
  isMobile,
}, testInfo) => {
  const name = uniqueName("Cơ bản", testInfo.project.name);
  await page.goto("/characters");
  await expect(async () => {
    await page.getByRole("button", { name: "Tạo nhân vật" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tên hiển thị").fill(name);
  await dialog.getByLabel("Họ tên đầy đủ").fill("Hà Minh Khôi");
  await dialog.getByLabel("Tuổi", { exact: true }).fill("31");
  await dialog.getByRole("button", { name: "Tạo", exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop()!;

  await page.getByRole("link", { name: "Mở trình biên tập" }).click();
  await expect(page.locator(READY)).toBeVisible();
  await goToGroup(page, "Tính cách", isMobile);
  const traits = field(page, "Đặc điểm tính cách chính");
  await traits.getByRole("button", { name: "Thêm mục" }).click();
  await traits.getByRole("textbox").first().fill("Điềm tĩnh");
  await expectSaved(page);

  await page.getByRole("link", { name: "Về hồ sơ" }).click();
  await expect(page).toHaveURL(new RegExp(`/characters/${id}$`));
  await expect(page.getByText("Hà Minh Khôi").first()).toBeVisible();
  await expect(page.getByText("31 tuổi").first()).toBeVisible();
  await expect(page.getByText("3 dữ kiện đã nhập")).toBeVisible();
});

test("given/family name are no longer edited, but stored values stay visible and intact", async ({
  page,
  isMobile,
}, testInfo) => {
  const id = await insertCharacter(uniqueName("Họ tên cũ", testInfo.project.name), {
    values: {
      "identity.given_name": { state: "specified", value: "Vân" },
      "identity.family_name": { state: "specified", value: "Lâm" },
    },
  });
  await openEditor(page, id);
  await goToGroup(page, "Định danh", isMobile);
  // Only the full name is offered for input…
  await expect(textbox(page, "Họ tên đầy đủ")).toBeVisible();
  await expect(textbox(page, "Tên (dữ liệu cũ)")).toHaveCount(0);
  await expect(textbox(page, "Họ (dữ liệu cũ)")).toHaveCount(0);
  // …while old values are shown read-only for a manual move, never merged automatically.
  await expect(field(page, "Tên (dữ liệu cũ)")).toContainText("Vân");
  await expect(field(page, "Họ (dữ liệu cũ)")).toContainText("Lâm");
  await expect(textbox(page, "Họ tên đầy đủ")).toHaveValue("");

  const stored = await readCharacter(id);
  expect(stored.facts.values["identity.given_name"]?.value).toBe("Vân");
  expect(stored.facts.values["identity.family_name"]?.value).toBe("Lâm");
  expect(stored.facts.values["identity.full_name"]).toBeUndefined();
});

test("the left navigation tree opens fields in built-in and custom groups", async ({
  page,
  isMobile,
}, testInfo) => {
  test.slow(); // several groups and a custom group
  const id = await insertCharacter(uniqueName("Chuyển trường", testInfo.project.name), {
    values: {},
    custom: {
      groups: [{ id: "cg_magic01", label: "Phép thuật" }],
      fields: [
        { key: "custom.spells01", label: "Phép đã học", group: "cg_magic01", kind: "long_text" },
        { key: "custom.mana01", label: "Mana", group: "cg_magic01", kind: "short_text" },
      ],
    },
  });
  await openEditor(page, id);

  const nav = page.getByRole("navigation", { name: "Nhóm dữ kiện" }).filter({ visible: true });
  const jump = async (group: string, label: string, subgroup?: string) => {
    if (isMobile) await page.getByRole("button", { name: /^Chuyển tới nhóm:/ }).click();
    const expand = nav.getByRole("button", { name: `Mở rộng ${group}`, exact: true });
    if (await expand.count()) await expand.click();
    if (subgroup) {
      const childExpand = nav.getByRole("button", { name: `Mở rộng ${subgroup}`, exact: true });
      if (await childExpand.count()) await childExpand.click();
    }
    await nav.getByRole("button", { name: label, exact: true }).focus();
    await page.keyboard.press("Enter");
  };

  // Appearance: a field inside a collapsed sub-group is opened, scrolled to and focused.
  await goToGroup(page, "Ngoại hình", isMobile);
  await page.getByRole("button", { name: /^Mái tóc/ }).click();
  await expect(textbox(page, "Màu tóc")).toBeHidden();
  await jump("Ngoại hình", "Màu tóc", "Mái tóc");
  await expect(textbox(page, "Màu tóc")).toBeFocused();
  await jump("Ngoại hình", "Chi tiết đặc điểm cơ thể", "Vóc dáng");
  await expect(textbox(page, "Chi tiết đặc điểm cơ thể")).toBeFocused();

  // Another built-in group.
  await goToGroup(page, "Tính cách", isMobile);
  await jump("Tính cách", "Nhược điểm");
  await expect(field(page, "Nhược điểm")).toBeInViewport();

  // A custom group.
  await goToGroup(page, "Phép thuật", isMobile);
  await jump("Phép thuật", "Mana");
  await expect(textbox(page, "Mana")).toBeFocused();
  if (isMobile) await page.getByRole("button", { name: /^Chuyển tới nhóm:/ }).click();
  await expect(nav.getByRole("button", { name: "Mana", exact: true })).toHaveAttribute(
    "aria-current",
    "location",
  );
  await expect(
    nav.getByRole("button", { name: "Thu gọn Ngoại hình", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("field-jump")).toHaveCount(0);

  // Navigation only: nothing was written.
  expect((await readCharacter(id)).revision).toBe(1);
});

test("body details save as a sensitive fact, without any AI involved", async ({
  page,
  isMobile,
}, testInfo) => {
  const id = await insertCharacter(uniqueName("Cơ thể", testInfo.project.name));
  await openEditor(page, id);
  await goToGroup(page, "Ngoại hình", isMobile);
  const details = field(page, "Chi tiết đặc điểm cơ thể");
  await expect(details).toContainText("Nhạy cảm");
  const text = "Vết bớt hình lá ở hông trái; giải phẫu ghi chú tự do — giữ nguyên từng chữ.";
  await textbox(page, "Chi tiết đặc điểm cơ thể").fill(text);
  await expectSaved(page);
  expect((await readCharacter(id)).facts.values["appearance.body_details"]).toEqual({
    state: "specified",
    value: text,
  });
});

test("moves between the fact editor and the profile, guarding unsaved input", async ({
  page,
  isMobile,
}, testInfo) => {
  test.slow(); // two pages, a failed save and a retry
  const id = await insertCharacter(uniqueName("Hai chiều", testInfo.project.name));
  await openEditor(page, id);
  await goToGroup(page, "Định danh", isMobile);

  // Saving fails (Server Actions are POSTs to the page URL): the input stays and leaving asks.
  await page.route(`**/characters/${id}/edit**`, (route) =>
    route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue(),
  );
  await textbox(page, "Họ tên đầy đủ").fill("Chưa lưu được");
  await expect(status(page)).toHaveText("Lưu thất bại", { timeout: 20_000 });
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByRole("link", { name: "Hồ sơ chi tiết" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(new RegExp(`/characters/${id}/edit`));
  await expect(textbox(page, "Họ tên đầy đủ")).toHaveValue("Chưa lưu được");

  // Once saved, the link goes straight to the same character's profile…
  await page.unroute(`**/characters/${id}/edit**`);
  await page.getByRole("button", { name: "Thử lưu lại" }).click();
  await expectSaved(page);
  await page.getByRole("link", { name: "Hồ sơ chi tiết" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(new RegExp(`/characters/${id}/profile$`));
  await page.getByRole("button", { name: "Tạo hồ sơ" }).click();
  await expect(page.locator("[data-profile-workspace][data-ready]:visible")).toBeVisible();

  // …and back again from the profile.
  await page.getByRole("link", { name: "Biên tập dữ kiện" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(new RegExp(`/characters/${id}/edit$`));
  await expect(page.locator(READY)).toBeVisible();
  expect((await readCharacter(id)).facts.values["identity.full_name"]?.value).toBe("Chưa lưu được");
});

test("dragging a field to the bin clears only its value; Escape or a miss changes nothing", async ({
  page,
  isMobile,
}, testInfo) => {
  test.skip(isMobile, "Drag to the bin is a desktop pointer gesture.");
  const id = await insertCharacter(uniqueName("Thùng rác", testInfo.project.name));
  await openEditor(page, id);
  await goToGroup(page, "Định danh", isMobile);

  const fullName = field(page, "Họ tên đầy đủ");
  const handle = fullName.locator("[data-field-drag-handle]");
  const bin = page.locator("[data-field-bin]");
  // A field without a value has nothing to drag.
  await expect(handle).toHaveCount(0);

  await textbox(page, "Họ tên đầy đủ").fill("Lâm Thanh Vân");
  await textbox(page, "Tuổi").fill("27");
  await expectSaved(page);

  const viewport = page.viewportSize()!;
  // The bin sits at the bottom centre of the viewport.
  const binCenter = { x: viewport.width / 2, y: viewport.height - 24 - 56 };
  const lift = async () => {
    // Every field is shown, so filling "Tuổi" can scroll the handle under the sticky header.
    await handle.evaluate((element) => element.scrollIntoView({ block: "center" }));
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + 30, { steps: 4 });
    await expect(bin).toBeVisible();
  };

  // Escape cancels.
  await lift();
  await page.mouse.move(binCenter.x, binCenter.y, { steps: 10 });
  await expect(bin).toHaveAttribute("data-field-bin", "over");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(bin).toHaveCount(0);
  await expect(textbox(page, "Họ tên đầy đủ")).toHaveValue("Lâm Thanh Vân");

  // Dropping outside the bin cancels.
  await lift();
  await page.mouse.move(viewport.width / 3, viewport.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(bin).toHaveCount(0);
  await expect(textbox(page, "Họ tên đầy đủ")).toHaveValue("Lâm Thanh Vân");

  // Dropping on the bin clears the value, keeps the field and every other fact.
  await lift();
  await page.mouse.move(binCenter.x, binCenter.y, { steps: 10 });
  await page.mouse.up();
  await expect(bin).toHaveCount(0);
  await expect(textbox(page, "Họ tên đầy đủ")).toHaveValue("");
  await expect(page.getByText("Đã xóa giá trị của “Họ tên đầy đủ”.")).toBeVisible();
  await expectSaved(page);
  const stored = await readCharacter(id);
  expect(stored.facts.values["identity.full_name"]).toBeUndefined();
  expect(stored.facts.values["identity.age"]?.value).toEqual({ value: 27, unit: "years" });
});
