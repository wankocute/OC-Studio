import { connection } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { isRepositoryError } from "@/db/repository-errors";
import { rejectUnauthenticatedRequest } from "@/features/auth/server/session";
import { createMediaRepository } from "@/features/library/server/media-repository";
import { getMediaStorage } from "@/features/media/server/storage";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
} as const;

/**
 * GET /media/:id — serve an uploaded image by its database id, after the session check.
 * The id is looked up in `media_assets`; the client never supplies a path, so nothing outside
 * the storage can be reached. The stored MIME type comes from the file signature.
 *
 * A media id always refers to the same bytes (re-uploads create new ids), so the browser may keep
 * it for a year (`private`: never in a shared/CDN cache) and a revalidation is answered with 304
 * from the id alone, without touching the database or the store. The body is streamed, so images
 * larger than Vercel's 4.5 MB response limit still work.
 */
export async function GET(request: Request, context: RouteContext<"/media/[id]">) {
  await connection();
  const denied = await rejectUnauthenticatedRequest();
  if (denied) return denied;
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return new Response(null, { status: 404 });

  const etag = `"${id}"`;
  const cacheHeaders = {
    ETag: etag,
    "Cache-Control": "private, max-age=31536000, immutable",
  };
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ...cacheHeaders, ...SECURITY_HEADERS } });
  }

  try {
    const asset = await createMediaRepository(getDb()).getAsset(id);
    const stored = await getMediaStorage().get(asset.storageKey);
    if (!stored) return new Response(null, { status: 404 });
    return new Response(stored.body, {
      headers: {
        "Content-Type": asset.mimeType,
        ...(stored.size !== null ? { "Content-Length": String(stored.size) } : {}),
        ...cacheHeaders,
        ...SECURITY_HEADERS,
        "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    if (isRepositoryError(error, "not_found")) return new Response(null, { status: 404 });
    console.error(error);
    return new Response(null, { status: 500 });
  }
}
