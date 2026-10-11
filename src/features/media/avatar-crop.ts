import type { CSSProperties } from "react";
import { z } from "zod";

/**
 * The square part of an avatar's source image that is shown, as fractions (0–1) of the image as
 * the browser displays it (EXIF orientation applied). The source file is never modified, so the
 * crop can be changed later without losing the rest of the picture.
 */
export type AvatarCrop = { x: number; y: number; width: number; height: number };

/** Rounding from pixels to fractions may overshoot an edge by a hair. */
const EDGE_TOLERANCE = 1e-4;
const fraction = z.number().finite().min(0).max(1);
const extent = z.number().finite().gt(0).max(1);

export const avatarCropSchema = z
  .strictObject({ x: fraction, y: fraction, width: extent, height: extent })
  .refine(
    (crop) =>
      crop.x + crop.width <= 1 + EDGE_TOLERANCE && crop.y + crop.height <= 1 + EDGE_TOLERANCE,
    { message: "Vùng cắt nằm ngoài ảnh." },
  );

const round = (value: number) => Math.round(value * 1e6) / 1e6;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Convert a crop area in percent (as reported by the cropper) to stored fractions, kept inside
 * the image so the stored value always passes `avatarCropSchema`.
 */
export function cropFromPercentages(area: AvatarCrop): AvatarCrop {
  const width = clamp(round(area.width / 100), 1e-6, 1);
  const height = clamp(round(area.height / 100), 1e-6, 1);
  return {
    x: clamp(round(area.x / 100), 0, 1 - width),
    y: clamp(round(area.y / 100), 0, 1 - height),
    width,
    height,
  };
}

/** The inverse of `cropFromPercentages`, to restore a stored crop in the cropper. */
export function cropToPercentages(crop: AvatarCrop): AvatarCrop {
  return { x: crop.x * 100, y: crop.y * 100, width: crop.width * 100, height: crop.height * 100 };
}

/**
 * Position the full source image inside a square, `overflow: hidden` frame so exactly the crop
 * is visible. Percentages make it independent of the frame size and of the stored pixel size.
 */
export function avatarCropStyle(crop: AvatarCrop): CSSProperties {
  return {
    position: "absolute",
    maxWidth: "none",
    width: `${100 / crop.width}%`,
    height: `${100 / crop.height}%`,
    left: `${(-crop.x / crop.width) * 100}%`,
    top: `${(-crop.y / crop.height) * 100}%`,
  };
}
