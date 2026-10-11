/**
 * Identify an uploaded image from its bytes (magic numbers), never from the client-supplied
 * MIME type or file name, and read its pixel size from the header when the format allows.
 *
 * Accepted: PNG, JPEG, GIF, WebP. SVG is deliberately not accepted (it can carry scripts).
 */

export type DetectedImage = {
  mimeType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  extension: "png" | "jpg" | "gif" | "webp";
  width?: number;
  height?: number;
};

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u16le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const u24le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
const u32be = (b: Uint8Array, i: number) =>
  ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;

function size(width: number, height: number): { width?: number; height?: number } {
  return width > 0 && height > 0 ? { width, height } : {};
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function detectPng(b: Uint8Array): DetectedImage | null {
  if (b.length < 24 || !PNG_SIGNATURE.every((byte, i) => b[i] === byte)) return null;
  if (ascii(b, 12, 4) !== "IHDR") return null;
  return { mimeType: "image/png", extension: "png", ...size(u32be(b, 16), u32be(b, 20)) };
}

function detectGif(b: Uint8Array): DetectedImage | null {
  if (b.length < 10) return null;
  const header = ascii(b, 0, 6);
  if (header !== "GIF87a" && header !== "GIF89a") return null;
  return { mimeType: "image/gif", extension: "gif", ...size(u16le(b, 6), u16le(b, 8)) };
}

/** Start-of-frame markers that carry the image size. */
const JPEG_SOF = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function detectJpeg(b: Uint8Array): DetectedImage | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) break;
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // markers without a length
      continue;
    }
    if (JPEG_SOF.has(marker)) {
      return {
        mimeType: "image/jpeg",
        extension: "jpg",
        ...size(u16be(b, i + 7), u16be(b, i + 5)),
      };
    }
    if (marker === 0xda || marker === 0xd9) break; // image data / end before a frame header
    i += 2 + u16be(b, i + 2);
  }
  return { mimeType: "image/jpeg", extension: "jpg" };
}

function detectWebp(b: Uint8Array): DetectedImage | null {
  if (b.length < 30 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  const chunk = ascii(b, 12, 4);
  const base = { mimeType: "image/webp", extension: "webp" } as const;
  if (chunk === "VP8 ") return { ...base, ...size(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff) };
  if (chunk === "VP8L" && b[20] === 0x2f) {
    const width = 1 + (((b[22]! & 0x3f) << 8) | b[21]!);
    const height = 1 + (((b[24]! & 0x0f) << 10) | (b[23]! << 2) | ((b[22]! & 0xc0) >> 6));
    return { ...base, ...size(width, height) };
  }
  if (chunk === "VP8X") return { ...base, ...size(1 + u24le(b, 24), 1 + u24le(b, 27)) };
  return null;
}

/** The image type of `bytes`, or `null` when it is not a supported image. */
export function detectImage(bytes: Uint8Array): DetectedImage | null {
  return detectPng(bytes) ?? detectJpeg(bytes) ?? detectGif(bytes) ?? detectWebp(bytes);
}

/** Declared types accepted for an upload, with the extension of the generated key. */
export const UPLOAD_CONTENT_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
} as const satisfies Record<DetectedImage["mimeType"], DetectedImage["extension"]>;

export const MEDIA_UPLOAD_LIMITS = {
  /**
   * Maximum upload size. Server Actions body limit is configured just above this (local disk);
   * with Vercel Blob the browser uploads directly and the token enforces it.
   */
  maxBytes: 8 * 1024 * 1024,
  maxMegabytes: 8,
} as const;
