/** Tiny real image files for tests (not shipped to users). */

/** 1×1 PNG. */
export const PNG_1X1 = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  ),
);

/** 1×1 GIF. */
export const GIF_1X1 = Uint8Array.from(
  Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"),
);

/** JPEG header with an APP0 segment and a SOF0 frame of 3×2 px. */
export const JPEG_3X2 = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x03, 0x03, 0x01, 0x22,
  0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
]);

/** WebP (VP8X) header declaring 640×480. */
export const WEBP_640X480 = (() => {
  const bytes = new Uint8Array(30);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set([22, 0, 0, 0], 4);
  bytes.set(new TextEncoder().encode("WEBPVP8X"), 8);
  bytes.set([10, 0, 0, 0], 16);
  bytes.set([639 & 0xff, 639 >> 8, 0], 24);
  bytes.set([479 & 0xff, 479 >> 8, 0], 27);
  return bytes;
})();
