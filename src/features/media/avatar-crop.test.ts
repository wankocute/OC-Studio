import { describe, expect, it } from "vitest";

import {
  avatarCropSchema,
  avatarCropStyle,
  cropFromPercentages,
  cropToPercentages,
} from "./avatar-crop";

describe("avatar crop", () => {
  it("stores the cropper's percentages as fractions and restores them", () => {
    const area = { x: 12.5, y: 0, width: 50, height: 75 };
    const crop = cropFromPercentages(area);
    expect(crop).toEqual({ x: 0.125, y: 0, width: 0.5, height: 0.75 });
    expect(cropToPercentages(crop)).toEqual(area);
    expect(avatarCropSchema.safeParse(crop).success).toBe(true);
  });

  it("keeps a crop that overshoots an edge by rounding inside the image", () => {
    const crop = cropFromPercentages({ x: 50.0004, y: -0.0002, width: 50, height: 100.0003 });
    expect(crop.x + crop.width).toBeLessThanOrEqual(1);
    expect(crop.y).toBe(0);
    expect(crop.height).toBe(1);
    expect(avatarCropSchema.safeParse(crop).success).toBe(true);
  });

  it("rejects crops outside the image or without area", () => {
    expect(avatarCropSchema.safeParse({ x: 0.6, y: 0, width: 0.5, height: 0.5 }).success).toBe(
      false,
    );
    expect(avatarCropSchema.safeParse({ x: 0, y: 0, width: 0, height: 0.5 }).success).toBe(false);
    expect(avatarCropSchema.safeParse({ x: 0, y: 0, width: 1, height: 1, zoom: 2 }).success).toBe(
      false,
    );
  });

  it("positions the whole source image so exactly the crop fills the frame", () => {
    expect(avatarCropStyle({ x: 0.25, y: 0.1, width: 0.5, height: 0.8 })).toMatchObject({
      position: "absolute",
      width: "200%",
      height: "125%",
      left: "-50%",
      top: "-12.5%",
    });
  });
});
