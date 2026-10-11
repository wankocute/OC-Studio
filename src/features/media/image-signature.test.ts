import { describe, expect, it } from "vitest";

import { detectImage } from "./image-signature";
import { GIF_1X1, JPEG_3X2, PNG_1X1, WEBP_640X480 } from "./test-images";

const text = (value: string) => new TextEncoder().encode(value);

describe("detectImage", () => {
  it("identifies supported images and reads their size", () => {
    expect(detectImage(PNG_1X1)).toEqual({
      mimeType: "image/png",
      extension: "png",
      width: 1,
      height: 1,
    });
    expect(detectImage(GIF_1X1)).toEqual({
      mimeType: "image/gif",
      extension: "gif",
      width: 1,
      height: 1,
    });
    expect(detectImage(JPEG_3X2)).toEqual({
      mimeType: "image/jpeg",
      extension: "jpg",
      width: 3,
      height: 2,
    });
    expect(detectImage(WEBP_640X480)).toEqual({
      mimeType: "image/webp",
      extension: "webp",
      width: 640,
      height: 480,
    });
  });

  it("reports the displayed size of a phone photo rotated by its EXIF orientation", () => {
    /** SOI + an APP1 Exif segment with one orientation entry + the SOF0 (3×2) of JPEG_3X2. */
    const withOrientation = (orientation: number, littleEndian: boolean) => {
      const u16 = (value: number) =>
        littleEndian ? [value & 0xff, value >> 8] : [value >> 8, value & 0xff];
      const u32 = (value: number) =>
        littleEndian
          ? [...u16(value & 0xffff), ...u16(value >>> 16)]
          : [...u16(value >>> 16), ...u16(value & 0xffff)];
      const tiff = [
        ...(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d]),
        ...u16(42),
        ...u32(8),
        ...u16(1),
        ...[...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0],
        ...u32(0),
      ];
      const payload = [...new TextEncoder().encode("Exif"), 0, 0, ...tiff];
      const app1 = [
        0xff,
        0xe1,
        ...[(payload.length + 2) >> 8, (payload.length + 2) & 0xff],
        ...payload,
      ];
      return Uint8Array.from([0xff, 0xd8, ...app1, ...JPEG_3X2.subarray(20)]);
    };
    expect(detectImage(withOrientation(6, false))).toMatchObject({ width: 2, height: 3 });
    expect(detectImage(withOrientation(8, true))).toMatchObject({ width: 2, height: 3 });
    expect(detectImage(withOrientation(3, true))).toMatchObject({ width: 3, height: 2 });
    expect(detectImage(withOrientation(1, false))).toMatchObject({ width: 3, height: 2 });
  });

  it("rejects non-images regardless of what they claim to be", () => {
    expect(detectImage(text("hello, I am a .png"))).toBeNull();
    expect(
      detectImage(text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')),
    ).toBeNull();
    expect(detectImage(text("%PDF-1.7"))).toBeNull();
    expect(detectImage(new Uint8Array())).toBeNull();
  });

  it("rejects truncated headers", () => {
    expect(detectImage(PNG_1X1.subarray(0, 12))).toBeNull();
    expect(detectImage(WEBP_640X480.subarray(0, 16))).toBeNull();
  });
});
