/**
 * One-off: copy images from the local disk (`storage/`) to the private Vercel Blob store.
 *
 *   Dry run (default, changes nothing):  pnpm media:to-blob
 *   Upload for real:                     pnpm media:to-blob --apply
 *   Other folder:                        pnpm media:to-blob --dir "D:\path\to\storage" [--apply]
 *
 * Run from the project root. Reads `.env.local`: DATABASE_URL (any database holding the same
 * `media_assets` rows — the local one or Neon after the restore) and BLOB_READ_WRITE_TOKEN (copy it
 * from Vercel → Storage → your Blob store → .env.local tab).
 *
 * Safe to run again: a blob that already exists with the same size is skipped, one that differs is
 * reported and never overwritten. The database is only read: `storage_key` is backend-neutral and
 * the blob pathname *is* the key, so no row needs to change — after this, `/media/<id>` finds every
 * image in Blob. Exit code 1 if anything is missing or failed.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { loadEnvConfig } from "@next/env";
import { BlobNotFoundError, head, put } from "@vercel/blob";
import pg from "pg";

/** Same shape as `isValidStorageKey` in src/features/media/server/storage.ts. */
const STORAGE_KEY_PATTERN = /^media\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(png|jpg|gif|webp)$/;
const BLOB_CACHE_SECONDS = 365 * 24 * 60 * 60;

type Row = { id: string; storage_key: string; mime_type: string; byte_size: number };
type Outcome = "uploaded" | "would_upload" | "already" | "missing_local" | "conflict" | "failed";

const LABELS: Record<Outcome, string> = {
  uploaded: "đã tải lên",
  would_upload: "sẽ tải lên (dry run)",
  already: "đã có trên Blob — bỏ qua",
  missing_local: "THIẾU file trên đĩa",
  conflict: "Blob đã có file KHÁC kích thước — không ghi đè",
  failed: "LỖI",
};

async function blobSize(key: string, token: string): Promise<number | null> {
  try {
    return (await head(key, { token })).size;
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
}

async function migrateOne(row: Row, root: string, token: string, apply: boolean): Promise<Outcome> {
  const key = row.storage_key;
  if (!STORAGE_KEY_PATTERN.test(key)) return "failed";
  const existing = await blobSize(key, token);
  if (existing !== null) return existing === Number(row.byte_size) ? "already" : "conflict";

  let bytes: Buffer;
  try {
    bytes = await readFile(path.join(root, ...key.split("/")));
  } catch {
    return "missing_local";
  }
  if (!apply) return "would_upload";
  await put(key, bytes, {
    access: "private",
    contentType: row.mime_type,
    addRandomSuffix: false,
    allowOverwrite: false,
    cacheControlMaxAge: BLOB_CACHE_SECONDS,
    token,
  });
  return "uploaded";
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { apply: { type: "boolean", default: false }, dir: { type: "string" } },
  });
  loadEnvConfig(process.cwd());
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!token || !databaseUrl) {
    console.error(
      "✖ Cần BLOB_READ_WRITE_TOKEN và DATABASE_URL trong .env.local (xem đầu file này).",
    );
    return 1;
  }
  const root = path.resolve(values.dir ?? process.env.MEDIA_STORAGE_DIR ?? "storage");
  console.log(`${values.apply ? "→ TẢI LÊN" : "→ DRY RUN (thêm --apply để tải lên)"} từ ${root}`);

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  let rows: Row[];
  try {
    rows = (
      await client.query<Row>(
        "select id, storage_key, mime_type, byte_size from media_assets order by created_at",
      )
    ).rows;
  } finally {
    await client.end();
  }

  const counts = new Map<Outcome, number>();
  for (const row of rows) {
    let outcome: Outcome;
    try {
      outcome = await migrateOne(row, root, token, values.apply);
    } catch (error) {
      outcome = "failed";
      console.error(`  ${row.storage_key}: ${(error as Error).message}`);
    }
    counts.set(outcome, (counts.get(outcome) ?? 0) + 1);
    if (outcome !== "already") console.log(`  ${LABELS[outcome]}: ${row.storage_key}`);
  }

  console.log(`\nTổng ${rows.length} ảnh trong database:`);
  for (const [outcome, n] of counts) console.log(`  ${LABELS[outcome]}: ${n}`);
  const problems =
    (counts.get("missing_local") ?? 0) +
    (counts.get("conflict") ?? 0) +
    (counts.get("failed") ?? 0);
  if (problems > 0) console.error("✖ Có ảnh chưa chuyển được — xem danh sách ở trên.");
  else console.log(values.apply ? "✔ Xong." : "✔ Dry run ổn. Chạy lại với --apply để tải lên.");
  return problems > 0 ? 1 : 0;
}

process.exit(await main());
