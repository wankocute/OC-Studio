/**
 * Masonry placement for the reference gallery. Every tile keeps its image's aspect ratio; tiles
 * go, in order, to the currently shortest column, so the visual order reads left-to-right like
 * the DOM (and keyboard) order.
 *
 * Positions are not pixels: they are expressed as "column widths" plus "gaps" so CSS can turn
 * them into lengths with container query units. The page therefore renders correctly before any
 * script runs and at any width, with no measuring and no layout jump on hydration.
 */

/** Height ÷ width limits for a tile. More extreme images are letterboxed, never cropped. */
export const TILE_RATIO_LIMITS = { min: 0.25, max: 4 } as const;

/** Column counts the gallery switches between (see `.masonry` in `globals.css`). */
export const MASONRY_COLUMNS = [2, 3] as const;

/** Gap size relative to a column, only used to decide which column is shorter. */
const GAP_ESTIMATE = 0.06;

export type TilePlacement = {
  column: number;
  /** Sum of the height ratios of the tiles above it in its column. */
  ratioAbove: number;
  /** Number of tiles above it (each followed by one gap). */
  tilesAbove: number;
};

export type ColumnExtent = { ratio: number; tiles: number };

export type MasonryLayout = { tiles: TilePlacement[]; columns: ColumnExtent[] };

/** Height ÷ width of a tile from the image size; unknown sizes start square. */
export function tileRatio(width: number | null | undefined, height: number | null | undefined) {
  if (!width || !height || width <= 0 || height <= 0) return 1;
  return Math.min(TILE_RATIO_LIMITS.max, Math.max(TILE_RATIO_LIMITS.min, height / width));
}

export function layoutMasonry(ratios: readonly number[], columnCount: number): MasonryLayout {
  const columns: ColumnExtent[] = Array.from({ length: Math.max(1, columnCount) }, () => ({
    ratio: 0,
    tiles: 0,
  }));
  const tiles = ratios.map((ratio) => {
    let column = 0;
    let shortest = Infinity;
    columns.forEach((extent, index) => {
      // Strictly shorter: ties go to the leftmost column, keeping the row-like reading order.
      const height = extent.ratio + extent.tiles * GAP_ESTIMATE;
      if (height < shortest - 1e-9) {
        shortest = height;
        column = index;
      }
    });
    const target = columns[column]!;
    const placement = { column, ratioAbove: target.ratio, tilesAbove: target.tiles };
    target.ratio += ratio;
    target.tiles += 1;
    return placement;
  });
  return { tiles, columns };
}

/** CSS length of a column's height, in terms of the `--col` and `--gap` custom properties. */
export function columnHeightCss({ ratio, tiles }: ColumnExtent): string {
  return `calc(var(--col) * ${ratio} + var(--gap) * ${Math.max(0, tiles - 1)})`;
}
