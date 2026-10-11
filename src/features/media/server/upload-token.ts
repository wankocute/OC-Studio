import "server-only";

import { MEDIA_UPLOAD_LIMITS, UPLOAD_CONTENT_TYPES } from "../image-signature";

import { isValidStorageKey } from "./storage";

/** A client token is only good for one quick upload. */
const TOKEN_TTL_MS = 10 * 60 * 1000;

export class UploadTokenRefusedError extends Error {
  constructor() {
    super("Upload not allowed.");
    this.name = "UploadTokenRefusedError";
  }
}

/**
 * Constraints baked into a Vercel Blob client token (enforced by Blob itself, not the browser):
 * only a server-shaped key, image types, at most 8 MB, never overwriting an existing blob.
 * The real file signature is still checked when the upload is attached.
 */
export function uploadTokenOptions(pathname: string, now = Date.now()) {
  if (!isValidStorageKey(pathname)) throw new UploadTokenRefusedError();
  return {
    allowedContentTypes: Object.keys(UPLOAD_CONTENT_TYPES),
    maximumSizeInBytes: MEDIA_UPLOAD_LIMITS.maxBytes,
    addRandomSuffix: false,
    allowOverwrite: false,
    validUntil: now + TOKEN_TTL_MS,
  };
}
