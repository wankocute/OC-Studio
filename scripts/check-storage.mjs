/**
 * Make sure the media directory exists and is writable before the server starts.
 * Usage: node scripts/check-storage.mjs — run from the project root (production start).
 *
 * Mirrors `getMediaStorage()`: MEDIA_STORAGE_DIR, or `<cwd>/storage`. Fails with a readable
 * message instead of letting the first upload fail later. On Railway it also warns when the
 * directory is not on a volume, because files outside a volume vanish on every redeploy.
 */
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const configured = process.env.MEDIA_STORAGE_DIR?.trim();
const root = path.resolve(configured || path.join(process.cwd(), "storage"));

async function main() {
  try {
    await mkdir(root, { recursive: true });
    const probe = path.join(root, `.write-check-${randomUUID()}`);
    await writeFile(probe, "ok", { flag: "wx" });
    await rm(probe, { force: true });
  } catch (error) {
    console.error(
      `✖ Không ghi được vào thư mục ảnh "${root}" (${error?.code ?? error?.message ?? error}).\n` +
        "  Kiểm tra MEDIA_STORAGE_DIR và Volume (mount path, quyền ghi, dung lượng).",
    );
    return 1;
  }
  console.log(`✔ Thư mục ảnh: ${root}`);

  const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim();
  if (process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_PROJECT_ID) {
    const inside =
      volume && (root === path.resolve(volume) || root.startsWith(path.resolve(volume) + path.sep));
    if (!inside) {
      console.warn(
        `⚠ Thư mục ảnh "${root}" KHÔNG nằm trên Railway Volume` +
          (volume ? ` (Volume đang mount ở "${volume}")` : " (service chưa gắn Volume)") +
          ". Ảnh tải lên sẽ mất sau mỗi lần deploy. Xem docs/deploy-railway.md.",
      );
    }
  }
  return 0;
}

process.exit(await main());
