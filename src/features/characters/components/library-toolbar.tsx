"use client";

import { LayoutGrid, List, Search, Star } from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  type LibraryParams,
  type LibrarySort,
  type LibraryView,
  libraryQueryString,
} from "@/features/characters/library-params";
import { messages } from "@/i18n";
import { cn } from "@/lib/utils";

const t = messages.characters;
const ALL_TAGS = "__all";
const SEARCH_DELAY_MS = 300;

const SORT_LABELS: Record<LibrarySort, string> = {
  updated: t.sortUpdated,
  created: t.sortCreated,
  name: t.sortName,
};

/** Search, sort, filters and view mode. All state lives in the URL. */
export function LibraryToolbar({
  params,
  tags,
}: {
  params: LibraryParams;
  tags: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(params.q);
  const [syncedQuery, setSyncedQuery] = useState(params.q);

  // The URL changed from elsewhere (e.g. "clear filters"): adopt it, unless it is our own typing.
  if (params.q !== syncedQuery) {
    setSyncedQuery(params.q);
    if (params.q !== query.normalize("NFC").trim()) setQuery(params.q);
  }

  const navigate = (patch: Partial<LibraryParams>) => {
    const href = `${pathname}${libraryQueryString({ ...params, ...patch })}`;
    startTransition(() => router.replace(href as Route, { scroll: false }));
  };

  // Debounce typing; only navigate when the text actually differs from the URL.
  useEffect(() => {
    if (query.normalize("NFC").trim() === params.q) return;
    const timer = setTimeout(() => {
      const href = `${pathname}${libraryQueryString({ ...params, q: query.normalize("NFC").trim() })}`;
      startTransition(() => router.replace(href as Route, { scroll: false }));
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, params, pathname, router]);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 transition-opacity lg:flex-row lg:items-center",
        pending && "opacity-70",
      )}
      aria-busy={pending}
    >
      <div role="search" className="relative w-full lg:max-w-sm">
        <Label htmlFor="character-search" className="sr-only">
          {t.searchLabel}
        </Label>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="character-search"
          type="search"
          placeholder={t.searchPlaceholder}
          className="h-9 pl-8"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
        <Select
          value={params.sort}
          onValueChange={(value) => navigate({ sort: value as LibrarySort })}
        >
          <SelectTrigger aria-label={t.sortLabel} className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as LibrarySort[]).map((sort) => (
              <SelectItem key={sort} value={sort}>
                {SORT_LABELS[sort]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {tags.length > 0 && (
          <Select
            value={params.tagId ?? ALL_TAGS}
            onValueChange={(value) => navigate({ tagId: value === ALL_TAGS ? null : value })}
          >
            <SelectTrigger aria-label={t.tagFilterLabel} className="h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TAGS}>{t.allTags}</SelectItem>
              {tags.map((tag) => (
                <SelectItem key={tag.id} value={tag.id}>
                  {tag.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          variant={params.favorites ? "secondary" : "outline"}
          size="sm"
          className="h-9"
          aria-pressed={params.favorites}
          onClick={() => navigate({ favorites: !params.favorites })}
        >
          <Star
            data-icon="inline-start"
            aria-hidden
            className={cn(params.favorites && "fill-warning text-warning")}
          />
          {t.favoritesOnly}
        </Button>

        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={params.view}
          onValueChange={(value) => value && navigate({ view: value as LibraryView })}
          aria-label={t.viewLabel}
        >
          <ToggleGroupItem value="grid" aria-label={t.viewGrid} className="h-9">
            <LayoutGrid aria-hidden />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label={t.viewList} className="h-9">
            <List aria-hidden />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
}
