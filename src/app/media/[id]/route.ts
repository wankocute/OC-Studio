import { connection } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { isRepositoryError } from "@/db/repository-errors";
import { createMediaRepository } from "@/features/library/server/media-repository";
import { getMediaStorage } from "@/features/media/server/storage";

/**
 * GET /media/:id — serve an uploaded image by its database id.
 * The id is looked up in `media_assets`; the client never supplies a path, so nothing outside
 * the storage root can be reached. The stored MIME type comes from the file signature.
 */
export async function GET(_request: Request, context: RouteContext<"/media/[id]">) {
  await connection();
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return new Response(null, { status: 404 });

  try {
    const asset = await createMediaRepository(getDb()).getAsset(id);
    const bytes = await getMediaStorage().get(asset.storageKey);
    if (!bytes) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(bytes.byteLength),
        // A media id always refers to the same bytes (re-uploads create new ids).
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    if (isRepositoryError(error, "not_found")) return new Response(null, { status: 404 });
    console.error(error);
    return new Response(null, { status: 500 });
  }
}
