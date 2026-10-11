import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { rejectUnauthenticatedRequest } from "@/features/auth/server/session";
import { uploadTokenOptions } from "@/features/media/server/upload-token";
import { getServerEnv } from "@/lib/env";

/**
 * POST /api/media/upload — issues Vercel Blob client tokens so the browser can upload an image
 * directly (a function request body is limited to 4.5 MB). Signed-in users only. There is no
 * upload-completed webhook: the browser attaches the file afterwards with a Server Action, which
 * re-checks it (Blob cannot call back into a password-protected app anyway).
 */
export async function POST(request: Request): Promise<Response> {
  const denied = await rejectUnauthenticatedRequest();
  if (denied) return denied;
  const token = getServerEnv().BLOB_READ_WRITE_TOKEN;
  if (!token) return Response.json({ error: "Blob storage is not configured." }, { status: 503 });

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (body?.type !== "blob.generate-client-token") {
    return Response.json({ error: "Unsupported event." }, { status: 400 });
  }
  try {
    const result = await handleUpload({
      body,
      request,
      token,
      onBeforeGenerateToken: async (pathname) => uploadTokenOptions(pathname),
    });
    return Response.json(result);
  } catch {
    return Response.json({ error: "Upload not allowed." }, { status: 400 });
  }
}
