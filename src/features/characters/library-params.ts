/**
 * Library list state lives in the URL (`/characters?q=…&sort=…`), so it survives reloads,
 * can be bookmarked and is parsed identically on server and client.
 */
import { z } from "zod";

export const LIBRARY_SORTS = ["updated", "created", "name"] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

export const LIBRARY_VIEWS = ["grid", "list"] as const;
export type LibraryView = (typeof LIBRARY_VIEWS)[number];

export type LibraryParams = {
  q: string;
  sort: LibrarySort;
  favorites: boolean;
  tagId: string | null;
  view: LibraryView;
};

export const DEFAULT_LIBRARY_PARAMS: LibraryParams = {
  q: "",
  sort: "updated",
  favorites: false,
  tagId: null,
  view: "grid",
};

const MAX_QUERY_LENGTH = 100;

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Lenient: unknown or malformed values fall back to defaults instead of failing the page. */
export function parseLibraryParams(raw: RawParams): LibraryParams {
  const sort = first(raw.sort);
  const view = first(raw.view);
  const tag = first(raw.tag);
  return {
    q: (first(raw.q) ?? "").normalize("NFC").trim().slice(0, MAX_QUERY_LENGTH),
    sort: LIBRARY_SORTS.includes(sort as LibrarySort) ? (sort as LibrarySort) : "updated",
    favorites: first(raw.favorites) === "1",
    tagId: tag && z.uuid().safeParse(tag).success ? tag : null,
    view: LIBRARY_VIEWS.includes(view as LibraryView) ? (view as LibraryView) : "grid",
  };
}

/** Query string for the given params, omitting defaults. */
export function libraryQueryString(params: LibraryParams): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.sort !== DEFAULT_LIBRARY_PARAMS.sort) search.set("sort", params.sort);
  if (params.favorites) search.set("favorites", "1");
  if (params.tagId) search.set("tag", params.tagId);
  if (params.view !== DEFAULT_LIBRARY_PARAMS.view) search.set("view", params.view);
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function hasActiveFilters(params: LibraryParams): boolean {
  return params.q !== "" || params.favorites || params.tagId !== null;
}
