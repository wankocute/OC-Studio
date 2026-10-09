import { BookUser, Plus, Search } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { UnavailableAction } from "@/components/shared/unavailable-action";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { messages } from "@/i18n";

const t = messages.characters;

export const metadata: Metadata = { title: t.title };

export default function CharactersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title={t.title}
        description={t.description}
        actions={<UnavailableAction label={t.create} icon={Plus} />}
      />

      <div role="search" className="relative max-w-md">
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
          disabled
          aria-describedby="character-search-hint"
        />
        <p id="character-search-hint" className="sr-only">
          {messages.common.notAvailableYet}
        </p>
      </div>

      <section aria-label={t.title}>
        <EmptyState icon={BookUser} title={t.emptyTitle} description={t.emptyBody} />
      </section>
    </div>
  );
}
