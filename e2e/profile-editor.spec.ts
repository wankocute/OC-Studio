import { expect, type Page, test } from "@playwright/test";

import {
  closeDatabase,
  insertCharacter,
  readProfileSections,
  readRevisionKinds,
  type StoredSection,
} from "./database";

test.afterAll(closeDatabase);

function uniqueName(prefix: string, project: string) {
  return `${prefix} ${project} ${Date.now().toString(36)}`;
}

/** Hidden copies of visited pages stay in the DOM (Activity), so only the visible one counts. */
const READY = "[data-profile-workspace][data-ready]:visible";

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Plain text of stored Tiptap JSON (one line per block). */
function storedText(doc: unknown): string {
  const walk = (node: unknown): string => {
    if (!node || typeof node !== "object") return "";
    const { type, text, content } = node as { type: string; text?: string; content?: unknown[] };
    if (type === "text") return text ?? "";
    const inner = (content ?? []).map(walk);
    return type === "paragraph" || type === "heading" ? inner.join("") : inner.join("\n");
  };
  // Tiptap keeps an empty trailing paragraph after a final list; it carries no text.
  return walk(doc).trimEnd();
}

async function createProfile(page: Page, name: string) {
  const id = await insertCharacter(name);
  await page.goto(`/characters/${id}`);
  await page.getByRole("link", { name: "Mở hồ sơ chi tiết" }).filter({ visible: true }).click();
  await expect(page.getByRole("heading", { name: "Bắt đầu hồ sơ chi tiết" })).toBeVisible();
  await page.getByRole("button", { name: "Tạo hồ sơ" }).click();
  await expect(page.locator(READY)).toBeVisible();
  return id;
}

async function openProfile(page: Page, id: string, section?: string) {
  await page.goto(`/characters/${id}/profile${section ? `?section=${section}` : ""}`);
  await expect(page.locator(READY)).toBeVisible();
}

async function goToSection(page: Page, label: string, isMobile: boolean) {
  if (isMobile) {
    await page.getByRole("combobox", { name: "Chuyển tới mục" }).click();
    await page.getByRole("option", { name: new RegExp(`^${escape(label)}`) }).click();
  } else {
    await page
      .getByRole("navigation", { name: "Các mục" })
      .getByRole("button", { name: new RegExp(`^${escape(label)} —`) })
      .click();
  }
  await expect(page.getByRole("heading", { level: 2, name: label, exact: true })).toBeVisible();
}

const editor = (page: Page, label: string) =>
  page.getByRole("textbox", { name: `Nội dung mục ${label}`, exact: true });

const status = (page: Page) => page.getByTestId("save-status").filter({ visible: true });

async function expectSaved(page: Page) {
  await expect(status(page)).toHaveText(/Đã lưu/, { timeout: 20_000 });
}

async function sectionByKey(id: string, key: string): Promise<StoredSection> {
  const section = (await readProfileSections(id)).find((item) => item.key === key);
  if (!section) throw new Error(`No section ${key}`);
  return section;
}

async function write(page: Page, label: string, text: string) {
  const box = editor(page, label);
  await box.click();
  await page.keyboard.type(text);
}

test("writes formatted Vietnamese text that autosaves and survives a reload", async ({
  page,
  isMobile,
}, testInfo) => {
  const id = await createProfile(page, uniqueName("Hồ sơ", testInfo.project.name));
  // The workspace opens on the first section, with the nine template sections.
  await expect(page.getByRole("heading", { level: 2, name: "Giới thiệu" })).toBeVisible();
  await goToSection(page, "Ngoại hình", isMobile);

  const box = editor(page, "Ngoại hình");
  await expect(box).toHaveAttribute("aria-multiline", "true");
  await box.click();
  await page.getByRole("button", { name: "Tiêu đề lớn" }).click();
  await page.keyboard.type("Tổng thể");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Mái tóc bạc như sương, đôi mắt ");
  await page.getByRole("button", { name: "In đậm" }).click();
  await expect(page.getByRole("button", { name: "In đậm" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.type("màu hổ phách");
  await page.keyboard.press("Control+b");
  await page.keyboard.type(".");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Danh sách dấu chấm" }).click();
  await page.keyboard.type("Sẹo nhỏ ở cằm");
  // Undo/redo from the toolbar.
  await page.getByRole("button", { name: "Hoàn tác" }).click();
  await page.getByRole("button", { name: "Làm lại" }).click();
  await expect(box).toContainText("Sẹo nhỏ ở cằm");
  await expectSaved(page);
  await expect(page.getByTestId("section-status").filter({ visible: true })).toHaveText(
    "Chưa duyệt",
  );

  const stored = await sectionByKey(id, "appearance");
  expect(storedText(stored.draft)).toBe(
    "Tổng thể\nMái tóc bạc như sương, đôi mắt màu hổ phách.\nSẹo nhỏ ở cằm",
  );
  expect(JSON.stringify(stored.draft)).toContain('"bold"');
  expect(JSON.stringify(stored.draft)).toContain('"bulletList"');
  expect(JSON.stringify(stored.draft)).toContain('{"type":"heading","attrs":{"level":2}');
  expect(stored.approved).toBeNull();

  await page.reload();
  await expect(page.locator(READY)).toBeVisible();
  await goToSection(page, "Ngoại hình", isMobile);
  await expect(editor(page, "Ngoại hình")).toContainText("màu hổ phách");
  await expect(editor(page, "Ngoại hình").locator("strong")).toHaveText("màu hổ phách");
  await expect(editor(page, "Ngoại hình").locator("li")).toHaveText("Sẹo nhỏ ở cằm");
  await expect(editor(page, "Ngoại hình").locator("h2")).toHaveText("Tổng thể");
});

test("approves a draft, then keeps the approved version while the draft changes", async ({
  page,
  isMobile,
}, testInfo) => {
  const id = await createProfile(page, uniqueName("Duyệt", testInfo.project.name));
  await goToSection(page, "Tính cách", isMobile);

  const approve = page.getByRole("button", { name: "Duyệt nội dung" });
  await expect(approve).toBeDisabled();
  await write(page, "Tính cách", "Điềm tĩnh, ít nói.");
  await expectSaved(page);
  await approve.click();
  await expect(page.getByText("Đã duyệt nội dung.")).toBeVisible();
  const sectionStatus = page.getByTestId("section-status").filter({ visible: true });
  await expect(sectionStatus).toHaveText("Đã duyệt");
  await expect(approve).toBeDisabled();

  await editor(page, "Tính cách").press("End");
  await page.keyboard.type(" Nhưng nóng nảy khi bị xúc phạm.");
  await expectSaved(page);
  await expect(sectionStatus).toHaveText("Có thay đổi chưa duyệt");

  let stored = await sectionByKey(id, "personality");
  expect(storedText(stored.approved)).toBe("Điềm tĩnh, ít nói.");
  expect(storedText(stored.draft)).toBe("Điềm tĩnh, ít nói. Nhưng nóng nảy khi bị xúc phạm.");

  // The approved version is shown separately and read-only.
  await page.getByRole("radio", { name: "Bản đã duyệt" }).click();
  await expect(page.getByTestId("approved-content").filter({ visible: true })).toHaveText(
    "Điềm tĩnh, ít nói.",
  );
  await expect(editor(page, "Tính cách")).toHaveCount(0);
  await page.getByRole("radio", { name: "Bản nháp" }).click();

  // Approving again replaces the approved version after a confirmation.
  await approve.click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Duyệt nội dung" }).click();
  await expect(sectionStatus).toHaveText("Đã duyệt");
  stored = await sectionByKey(id, "personality");
  expect(storedText(stored.approved)).toBe("Điềm tĩnh, ít nói. Nhưng nóng nảy khi bị xúc phạm.");
  expect(await readRevisionKinds(stored.id)).toEqual(["approval", "approval"]);

  // Preview: the whole profile, draft or approved.
  await page.getByRole("radio", { name: "Xem trước" }).click();
  const preview = page.getByTestId("profile-preview").filter({ visible: true });
  await expect(preview.getByRole("heading", { name: "Tính cách" })).toBeVisible();
  await expect(preview).toContainText("Nhưng nóng nảy khi bị xúc phạm.");
  await page.getByRole("radio", { name: "Bản đã duyệt" }).click();
  await expect(preview).toContainText("Chưa có bản đã duyệt.");
});

test("restores an older version as the draft without touching the approved one", async ({
  page,
  isMobile,
}, testInfo) => {
  const id = await createProfile(page, uniqueName("Lịch sử", testInfo.project.name));
  await goToSection(page, "Tiểu sử", isMobile);
  await write(page, "Tiểu sử", "Sinh ra ở làng chài.");
  await expectSaved(page);
  await page.getByRole("button", { name: "Duyệt nội dung" }).click();
  await expect(page.getByTestId("section-status").filter({ visible: true })).toHaveText("Đã duyệt");

  await editor(page, "Tiểu sử").press("Control+a");
  await page.keyboard.type("Bản viết lại hoàn toàn.");
  await expectSaved(page);

  await page.getByRole("button", { name: "Lịch sử" }).click();
  const sheet = page.getByRole("dialog", { name: /Lịch sử phiên bản/ });
  await sheet.getByRole("button", { name: /Bản duyệt/ }).click();
  await expect(sheet).toContainText("Sinh ra ở làng chài.");
  await sheet.getByRole("button", { name: "Khôi phục thành bản nháp" }).click();
  await expect(page.getByText("Đã khôi phục thành bản nháp.")).toBeVisible();
  await expect(editor(page, "Tiểu sử")).toHaveText("Sinh ra ở làng chài.");
  await expect(page.getByTestId("section-status").filter({ visible: true })).toHaveText("Đã duyệt");

  const stored = await sectionByKey(id, "biography");
  expect(storedText(stored.draft)).toBe("Sinh ra ở làng chài.");
  expect(storedText(stored.approved)).toBe("Sinh ra ở làng chài.");
  // The replaced draft stays recoverable.
  expect(await readRevisionKinds(stored.id)).toEqual(["restore", "before_restore", "approval"]);

  await page.getByRole("button", { name: "Lịch sử" }).click();
  await expect(sheet.getByRole("button", { name: /Trước khi khôi phục/ })).toContainText(
    "Bản viết lại hoàn toàn.",
  );
});

test("adds, renames, reorders and hides sections", async ({ page, isMobile }, testInfo) => {
  test.slow(); // several dialogs and menus
  const id = await createProfile(page, uniqueName("Cấu trúc", testInfo.project.name));

  const openMenu = async (label: string) => {
    if (isMobile) {
      await goToSection(page, label, isMobile);
    }
    await page
      .getByRole("button", { name: `Tùy chọn mục ${label}`, exact: true })
      .filter({ visible: true })
      .click();
  };

  // Add a custom section with a source group.
  await page.getByRole("button", { name: "Thêm mục" }).filter({ visible: true }).click();
  const add = page.getByRole("dialog", { name: "Thêm mục mới" });
  await add.getByRole("textbox", { name: "Tên mục" }).fill("  Phép thuật  ");
  await add.getByRole("checkbox", { name: "Cuộc sống" }).check();
  await add.getByRole("button", { name: "Tạo" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Phép thuật" })).toBeVisible();
  await write(page, "Phép thuật", "Điều khiển băng.");
  await expectSaved(page);

  // Rename a built-in section, then hide it and move the custom section up.
  await openMenu("Giới thiệu");
  await page.getByRole("menuitem", { name: "Đổi tên" }).click();
  const rename = page.getByRole("dialog", { name: "Đổi tên mục" });
  await rename.getByRole("textbox", { name: "Tên mục" }).fill("Lời mở đầu");
  await rename.getByRole("button", { name: "Lưu" }).click();
  await expect(rename).toBeHidden();
  await openMenu("Lời mở đầu");
  await page.getByRole("menuitem", { name: "Ẩn khỏi hồ sơ" }).click();
  await openMenu("Phép thuật");
  await page.getByRole("menuitem", { name: "Chuyển lên" }).click();

  await expect
    .poll(async () => (await readProfileSections(id)).map((s) => s.title ?? s.key))
    .toEqual([
      "Lời mở đầu",
      "appearance",
      "personality",
      "psychology",
      "behavior",
      "background",
      "lifestyle",
      "biography",
      "Phép thuật",
      "relationships",
    ]);
  const sections = await readProfileSections(id);
  expect(sections[0]!.isHidden).toBe(true);
  expect(sections[8]!.key).toMatch(/^ps_[a-z0-9]+$/);

  // After a reload the structure is the same; hidden sections are left out of the preview.
  await page.reload();
  await expect(page.locator(READY)).toBeVisible();
  await page.getByRole("radio", { name: "Xem trước" }).click();
  const preview = page.getByTestId("profile-preview").filter({ visible: true });
  await expect(preview.getByRole("heading", { level: 2 })).toHaveText([
    "Ngoại hình",
    "Tính cách",
    "Tâm lý",
    "Hành vi",
    "Xuất thân",
    "Cuộc sống",
    "Tiểu sử",
    "Phép thuật",
    "Quan hệ",
  ]);
  await expect(preview).toContainText("Điều khiển băng.");
});

test("resolves a conflict between two tabs without losing either version", async ({
  page: first,
  context,
  isMobile,
}, testInfo) => {
  test.slow(); // two pages, several saves
  const id = await createProfile(first, uniqueName("Xung đột", testInfo.project.name));
  const second = await context.newPage();
  await openProfile(second, id, "psychology");
  await goToSection(first, "Tâm lý", isMobile);

  await write(second, "Tâm lý", "Bản của tab hai.");
  await expectSaved(second);

  await write(first, "Tâm lý", "Bản của tab một.");
  await expect(first.getByText("Mục này đã được sửa ở tab khác")).toBeVisible({ timeout: 20_000 });
  await expect(status(first)).toHaveText("Xung đột chỉnh sửa");
  await first.getByText("Bản mới nhất trên máy chủ").click();
  await expect(first.getByRole("alert").filter({ hasText: "tab khác" })).toContainText(
    "Bản của tab hai.",
  );

  await first.getByRole("button", { name: "Giữ bản của tôi" }).click();
  await expectSaved(first);
  const stored = await sectionByKey(id, "psychology");
  expect(storedText(stored.draft)).toBe("Bản của tab một.");
  // The newer version from the other tab was kept in the history before being replaced.
  expect(await readRevisionKinds(stored.id)).toEqual(["conflict"]);

  // The other tab now conflicts too and can take the latest version instead.
  await second.keyboard.type(" Thêm.");
  await expect(second.getByRole("button", { name: "Dùng bản mới nhất" })).toBeVisible({
    timeout: 20_000,
  });
  await second.getByRole("button", { name: "Dùng bản mới nhất" }).click();
  await expect(editor(second, "Tâm lý")).toHaveText("Bản của tab một.");
  expect(storedText((await sectionByKey(id, "psychology")).draft)).toBe("Bản của tab một.");
});

test("keeps the draft when saving fails, retries, and warns before leaving", async ({
  page,
  isMobile,
}, testInfo) => {
  const id = await createProfile(page, uniqueName("Lỗi lưu", testInfo.project.name));
  await goToSection(page, "Xuất thân", isMobile);

  // Server Actions are POSTs to the page URL: make them fail like a dropped connection.
  await page.route(`**/characters/${id}/profile**`, (route) =>
    route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue(),
  );
  await write(page, "Xuất thân", "Con gái một thợ rèn.");
  await expect(status(page)).toHaveText("Lưu thất bại", { timeout: 20_000 });
  await expect(editor(page, "Xuất thân")).toHaveText("Con gái một thợ rèn.");

  // Leaving with unsaved content asks first; dismissing keeps the page.
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByRole("link", { name: "Về trang nhân vật" }).click();
  await expect(page).toHaveURL(new RegExp(`/characters/${id}/profile`));

  await page.unroute(`**/characters/${id}/profile**`);
  await page.getByRole("button", { name: "Thử lưu lại" }).click();
  await expectSaved(page);
  expect(storedText((await sectionByKey(id, "background")).draft)).toBe("Con gái một thợ rèn.");

  // Saved: no warning, and the character page shows the profile summary.
  await page.getByRole("link", { name: "Về trang nhân vật" }).click();
  await expect(page.getByText("0/9 mục đã duyệt")).toBeVisible();
});
