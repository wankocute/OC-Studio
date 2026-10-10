import { describe, expect, it } from "vitest";

import {
  DEFAULT_LIBRARY_PARAMS,
  hasActiveFilters,
  libraryQueryString,
  parseLibraryParams,
} from "./library-params";

const TAG = "7e9d8c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b";

describe("library URL params", () => {
  it("defaults when empty or malformed", () => {
    expect(parseLibraryParams({})).toEqual(DEFAULT_LIBRARY_PARAMS);
    expect(
      parseLibraryParams({ sort: "random", view: "table", tag: "../etc", favorites: "yes" }),
    ).toEqual(DEFAULT_LIBRARY_PARAMS);
  });

  it("parses valid values and normalises the search text", () => {
    expect(
      parseLibraryParams({
        q: "  Ngọc ".normalize("NFD"),
        sort: "name",
        favorites: "1",
        tag: TAG,
        view: "list",
      }),
    ).toEqual({ q: "Ngọc", sort: "name", favorites: true, tagId: TAG, view: "list" });
    expect(parseLibraryParams({ q: ["a", "b"] }).q).toBe("a");
    expect(parseLibraryParams({ q: "x".repeat(500) }).q).toHaveLength(100);
  });

  it("round-trips through the query string, omitting defaults", () => {
    expect(libraryQueryString(DEFAULT_LIBRARY_PARAMS)).toBe("");
    const params = {
      q: "Khải & co",
      sort: "created",
      favorites: true,
      tagId: TAG,
      view: "list",
    } as const;
    const query = libraryQueryString(params);
    expect(parseLibraryParams(Object.fromEntries(new URLSearchParams(query.slice(1))))).toEqual(
      params,
    );
  });

  it("knows when filters are active", () => {
    expect(hasActiveFilters(DEFAULT_LIBRARY_PARAMS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_LIBRARY_PARAMS, sort: "name", view: "list" })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_LIBRARY_PARAMS, favorites: true })).toBe(true);
  });
});
