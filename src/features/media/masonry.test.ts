import { describe, expect, it } from "vitest";

import { columnHeightCss, layoutMasonry, tileRatio } from "./masonry";

describe("tileRatio", () => {
  it("keeps the image's proportions and starts unknown sizes square", () => {
    expect(tileRatio(1200, 800)).toBeCloseTo(2 / 3);
    expect(tileRatio(800, 1200)).toBeCloseTo(1.5);
    expect(tileRatio(null, null)).toBe(1);
    expect(tileRatio(0, 100)).toBe(1);
  });

  it("bounds extreme panoramas and strips (the image is letterboxed, not cropped)", () => {
    expect(tileRatio(10_000, 100)).toBe(0.25);
    expect(tileRatio(100, 10_000)).toBe(4);
  });
});

describe("layoutMasonry", () => {
  it("fills the first row left to right, then the shortest column", () => {
    // portrait, landscape, square, landscape
    const { tiles, columns } = layoutMasonry([1.5, 0.5, 1, 0.5], 3);
    expect(tiles.map((tile) => tile.column)).toEqual([0, 1, 2, 1]);
    expect(tiles[3]).toEqual({ column: 1, ratioAbove: 0.5, tilesAbove: 1 });
    expect(columns).toEqual([
      { ratio: 1.5, tiles: 1 },
      { ratio: 1, tiles: 2 },
      { ratio: 1, tiles: 1 },
    ]);
  });

  it("never stacks two tiles in the same slot", () => {
    const ratios = [1, 1.4, 0.6, 0.6, 1.3, 1, 0.7, 2, 0.5];
    for (const count of [1, 2, 3]) {
      const { tiles } = layoutMasonry(ratios, count);
      const slots = tiles.map((tile) => `${tile.column}:${tile.tilesAbove}`);
      expect(new Set(slots).size).toBe(ratios.length);
    }
  });

  it("is empty for no images and keeps order stable when one is appended", () => {
    expect(layoutMasonry([], 2).tiles).toEqual([]);
    const before = layoutMasonry([1, 0.7, 1.2], 2).tiles;
    const after = layoutMasonry([1, 0.7, 1.2, 1], 2).tiles;
    expect(after.slice(0, 3)).toEqual(before);
  });

  it("describes column heights in column widths plus gaps", () => {
    expect(columnHeightCss({ ratio: 2.5, tiles: 3 })).toBe(
      "calc(var(--col) * 2.5 + var(--gap) * 2)",
    );
    expect(columnHeightCss({ ratio: 0, tiles: 0 })).toBe("calc(var(--col) * 0 + var(--gap) * 0)");
  });
});
