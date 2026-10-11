import { readFileSync } from "node:fs";

import { expect, type Page, test } from "@playwright/test";

import {
  closeDatabase,
  databaseSnapshot,
  insertAvatar,
  insertCharacter,
  insertProfile,
  softDeleteCharacter,
} from "./database";

test.afterAll(closeDatabase);

function uniqueName(prefix: string, project: string) {
  return `${prefix} ${project} ${Date.now().toString(36)}`;
}

const text = (value: string) => ({ type: "text", text: value });
const paragraph = (value: string) => ({ type: "paragraph", content: [text(value)] });
const doc = (...blocks: unknown[]) => ({ type: "doc", content: blocks });

/** Rich content using every supported block and mark, in Vietnamese. */
const richAppearance = doc(
  { type: "heading", attrs: { level: 2 }, content: [text("Tổng thể")] },
  {
    type: "paragraph",
    content: [
      text("Mái tóc bạc như sương, đôi mắt "),
      { type: "text", text: "màu hổ phách", marks: [{ type: "bold" }] },
      text(", giọng "),
      { type: "text", text: "trầm", marks: [{ type: "italic" }] },
      text(" và "),
      { type: "text", text: "chậm rãi", marks: [{ type: "underline" }] },
      text("."),
    ],
  },
  {
    type: "bulletList",
    content: [
      { type: "listItem", content: [paragraph("Sẹo nhỏ ở cằm")] },
      { type: "listItem", content: [paragraph("Nhẫn bạc ở tay trái")] },
    ],
  },
  {
    type: "orderedList",
    attrs: { start: 1, type: null },
    content: [{ type: "listItem", content: [paragraph("Bước một")] }],
  },
  { type: "blockquote", content: [paragraph("“Gió không bao giờ hỏi đường.”")] },
  // A long unbroken token must wrap instead of overflowing the page.
  paragraph(`https://example.invalid/${"duong-dan-rat-dai-".repeat(12)}`),
);

async function seed(project: string, options: { avatar?: boolean; long?: boolean } = {}) {
  const id = await insertCharacter(uniqueName("Bản in", project));
  const longBiography = doc(
    ...Array.from({ length: 60 }, (_, index) =>
      paragraph(
        `Đoạn ${index + 1}: năm ấy làng chài ven biển chìm trong sương mù dày đặc, và cô bé ` +
          `học cách đọc hướng gió từ những cánh buồm cũ kỹ của ông ngoại.`,
      ),
    ),
  );
  await insertProfile(id, [
    {
      key: "intro",
      draft: doc(paragraph("Giới thiệu đã duyệt.")),
      approved: doc(paragraph("Giới thiệu đã duyệt.")),
    },
    { key: "appearance", draft: doc(paragraph("Ngoại hình NHÁP MỚI")), approved: richAppearance },
    { key: "personality", draft: doc(paragraph("Tính cách CHƯA DUYỆT")) },
    {
      key: "psychology",
      hidden: true,
      draft: doc(paragraph("Tâm lý ẨN")),
      approved: doc(paragraph("Tâm lý ẨN")),
    },
    { key: "behavior", draft: doc({ type: "paragraph" }) },
    { key: "background" },
    {
      key: "ps_print0001",
      title: "Phép thuật",
      draft: doc(paragraph("Điều khiển băng.")),
      approved: doc(paragraph("Điều khiển băng.")),
    },
    {
      key: "biography",
      title: "Tiểu sử ven biển",
      draft: options.long ? longBiography : doc(paragraph("Tiểu sử nháp")),
      approved: options.long ? longBiography : undefined,
    },
  ]);
  if (options.avatar) await insertAvatar(id, 400, 200);
  return id;
}

const documentOf = (page: Page) => page.getByTestId("print-document");

test("prints approved content only, in order, read-only", async ({ page }, testInfo) => {
  const id = await seed(testInfo.project.name, { avatar: true });
  const before = await databaseSnapshot(id);

  await page.goto(`/characters/${id}/profile/print`);
  const printed = documentOf(page);
  await expect(page.getByTestId("print-source")).toHaveText("Bản đã duyệt");
  await expect(printed.getByRole("heading", { level: 2 })).toHaveText([
    "Giới thiệu",
    "Ngoại hình",
    "Tổng thể",
    "Phép thuật",
  ]);
  // Approved text only: no draft is mixed in, hidden and unapproved sections are left out.
  await expect(printed).not.toContainText("NHÁP MỚI");
  await expect(printed).not.toContainText("CHƯA DUYỆT");
  await expect(printed).not.toContainText("Tâm lý");
  await expect(
    page.getByText("2 mục chưa được duyệt sẽ bị bỏ qua", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("1 mục có bản nháp mới hơn", { exact: false })).toBeVisible();

  // Formatting survives: marks, lists, quote, Vietnamese text.
  await expect(printed.locator("strong")).toHaveText("màu hổ phách");
  await expect(printed.locator("em")).toHaveText("trầm");
  await expect(printed.locator("u")).toHaveText("chậm rãi");
  await expect(printed.locator("ul > li")).toHaveText(["Sẹo nhỏ ở cằm", "Nhẫn bạc ở tay trái"]);
  await expect(printed.locator("ol > li")).toHaveText(["Bước một"]);
  await expect(printed.locator("blockquote")).toHaveText("“Gió không bao giờ hỏi đường.”");

  // The avatar keeps its 2:1 aspect ratio.
  const avatar = printed.getByRole("img");
  await expect(avatar).toBeVisible();
  await expect
    .poll(() => avatar.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  const box = (await avatar.boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(2, 1);

  // The print media hides the toolbar and nothing overflows the paper.
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "In / Lưu PDF" })).toBeHidden();
  const overflow = await printed.evaluate((element) =>
    [...element.querySelectorAll("*")].some((child) => child.scrollWidth > element.clientWidth + 1),
  );
  expect(overflow).toBe(false);

  expect(await databaseSnapshot(id)).toBe(before);
});

test("prints the saved draft with a clear label, and switches between sources", async ({
  page,
}, testInfo) => {
  const id = await seed(testInfo.project.name);
  await page.goto(`/characters/${id}/profile/print?source=draft`);
  const printed = documentOf(page);
  await expect(page.getByTestId("print-source")).toHaveText("Bản nháp đã lưu");
  await expect(printed).toContainText("Bản nháp — chưa được duyệt");
  await expect(printed.getByRole("heading", { level: 2 })).toHaveText([
    "Giới thiệu",
    "Ngoại hình",
    "Tính cách",
    "Phép thuật",
    "Tiểu sử ven biển",
  ]);
  await expect(printed).toContainText("Ngoại hình NHÁP MỚI");
  await expect(printed).not.toContainText("Tâm lý ẨN");

  await page.getByRole("link", { name: "Chuyển sang bản đã duyệt" }).click();
  await expect(page.getByTestId("print-source")).toHaveText("Bản đã duyệt");
  await expect(printed).not.toContainText("Bản nháp — chưa được duyệt");
});

test("shows empty states and handles missing characters", async ({ page }, testInfo) => {
  const noProfile = await insertCharacter(uniqueName("Không hồ sơ", testInfo.project.name));
  await page.goto(`/characters/${noProfile}/profile/print`);
  await expect(page.getByRole("heading", { name: "Chưa có nội dung để in" })).toBeVisible();
  await expect(page.getByText("Nhân vật này chưa có hồ sơ chi tiết.")).toBeVisible();
  await expect(page.getByRole("button", { name: "In / Lưu PDF" })).toBeDisabled();

  const unapproved = await insertCharacter(uniqueName("Chưa duyệt", testInfo.project.name));
  await insertProfile(unapproved, [{ key: "intro", draft: doc(paragraph("Nháp")) }]);
  await page.goto(`/characters/${unapproved}/profile/print`);
  await expect(page.getByText(/Chưa có mục nào được duyệt/)).toBeVisible();
  // Opening the page did not create anything for the character without a profile.
  await page.goto(`/characters/${noProfile}/profile/print?source=draft`);
  await expect(page.getByText("Nhân vật này chưa có hồ sơ chi tiết.")).toBeVisible();

  await page.goto(`/characters/${unapproved}/profile/print?source=pdf`);
  await expect(page.getByRole("heading", { name: "Không tìm thấy trang" })).toBeVisible();

  await softDeleteCharacter(unapproved);
  await page.goto(`/characters/${unapproved}/profile/print`);
  await expect(page.getByRole("heading", { name: "Không tìm thấy trang" })).toBeVisible();
});

test("renders a long profile as several A4 pages without losing content", async ({
  page,
  browserName,
  isMobile,
}, testInfo) => {
  test.skip(browserName !== "chromium" || isMobile, "PDF output needs desktop Chromium.");
  const id = await seed(testInfo.project.name, { long: true, avatar: true });
  await page.goto(`/characters/${id}/profile/print`);
  await expect(documentOf(page)).toContainText("Đoạn 60:");

  // A temporary PDF in the test output folder (git-ignored), never committed.
  const file = testInfo.outputPath("profile.pdf");
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
  const pdf = readFileSync(file).toString("latin1");
  const pages = pdf.match(/\/Type\s*\/Page(?!s)/g)?.length ?? 0;
  expect(pages).toBeGreaterThanOrEqual(2);
  // A4 portrait: 595 × 842 points (Chromium writes e.g. 594.96 × 841.92).
  const box = pdf.match(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/);
  expect(Number(box?.[1])).toBeCloseTo(595, 0);
  expect(Number(box?.[2])).toBeCloseTo(842, 0);
});

test("opens the print view from the profile, blocking drafts that are not saved", async ({
  page,
  context,
}, testInfo) => {
  test.slow();
  const id = await seed(testInfo.project.name);
  await page.goto(`/characters/${id}/profile`);
  await expect(page.locator("[data-profile-workspace][data-ready]:visible")).toBeVisible();

  // Make saving fail so a section stays unsaved.
  await page.route(`**/characters/${id}/profile**`, (route) =>
    route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue(),
  );
  const editor = page.getByRole("textbox", { name: "Nội dung mục Giới thiệu" });
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Thêm");
  await expect(page.getByTestId("save-status").filter({ visible: true })).toHaveText(
    "Lưu thất bại",
    { timeout: 20_000 },
  );

  await page.getByRole("button", { name: "In / Lưu PDF" }).click();
  const dialog = page.getByRole("dialog", { name: "In hoặc lưu PDF" });
  await expect(dialog.getByRole("radio", { name: "Bản đã duyệt" })).toBeChecked();
  await expect(dialog).toContainText("3 mục sẽ được in.");
  await expect(dialog).toContainText("2 mục chưa được duyệt sẽ bị bỏ qua");

  await dialog.getByRole("radio", { name: "Bản nháp đã lưu" }).click();
  await expect(dialog).toContainText("Còn 1 mục chưa lưu");
  await expect(dialog.getByRole("button", { name: "Mở bản in" })).toBeDisabled();

  // Once saved, the draft print opens in a new tab with the saved text.
  await dialog.getByRole("button", { name: "Hủy" }).click();
  await page.unroute(`**/characters/${id}/profile**`);
  await page.getByRole("button", { name: "Thử lưu lại" }).click();
  await expect(page.getByTestId("save-status").filter({ visible: true })).toHaveText(/Đã lưu/, {
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "In / Lưu PDF" }).click();
  await dialog.getByRole("radio", { name: "Bản nháp đã lưu" }).click();
  const [printPage] = await Promise.all([
    context.waitForEvent("page"),
    dialog.getByRole("link", { name: "Mở bản in" }).click(),
  ]);
  await expect(printPage.getByTestId("print-source")).toHaveText("Bản nháp đã lưu");
  await expect(documentOf(printPage)).toContainText("Giới thiệu đã duyệt. Thêm");
});

test("prints straight from the character page, with the same choices", async ({
  page,
  context,
}, testInfo) => {
  const id = await seed(testInfo.project.name);
  await page.goto(`/characters/${id}`);
  await expect(async () => {
    await page.getByRole("button", { name: "In / Lưu PDF" }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  const dialog = page.getByRole("dialog", { name: "In hoặc lưu PDF" });
  await expect(dialog.getByRole("radio", { name: "Bản đã duyệt" })).toBeChecked();
  await expect(dialog).toContainText("3 mục sẽ được in.");
  await expect(dialog).toContainText("2 mục chưa được duyệt sẽ bị bỏ qua");
  const [printPage] = await Promise.all([
    context.waitForEvent("page"),
    dialog.getByRole("link", { name: "Mở bản in" }).click(),
  ]);
  await expect(printPage.getByTestId("print-source")).toHaveText("Bản đã duyệt");
  await expect(documentOf(printPage)).not.toContainText("NHÁP MỚI");

  // A character without a profile says so before opening anything.
  const bare = await insertCharacter(uniqueName("Chưa hồ sơ", testInfo.project.name));
  await page.goto(`/characters/${bare}`);
  await expect(async () => {
    await page.getByRole("button", { name: "In / Lưu PDF" }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByRole("dialog")).toContainText("Nhân vật này chưa có hồ sơ chi tiết.");
});
