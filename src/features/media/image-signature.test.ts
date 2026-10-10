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
