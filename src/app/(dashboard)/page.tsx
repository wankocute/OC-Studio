import { ArrowRight, BookUser, Feather } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DatabaseStatus,
  DatabaseStatusFallback,
} from "@/features/system-status/components/database-status";
import { StatusRow } from "@/features/system-status/components/status-row";
import { messages } from "@/i18n";

const t = messages.dashboard;

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader title={t.title} description={messages.app.description} />

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Feather className="size-5" aria-hidden />
            </div>
            <CardTitle className="text-xl font-semibold">{t.welcomeTitle}</CardTitle>
            <CardDescription className="max-w-prose text-pretty">{t.welcomeBody}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/characters">
                <BookUser data-icon="inline-start" aria-hidden />
                {t.openLibrary}
                <ArrowRight data-icon="inline-end" aria-hidden />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t.statusTitle}</CardTitle>
            <CardDescription>{t.statusDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <StatusRow
                label={messages.status.application}
                tone="success"
                value={messages.status.applicationReady}
              />
              <Suspense fallback={<DatabaseStatusFallback />}>
                <DatabaseStatus />
              </Suspense>
            </dl>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="recent-characters" className="space-y-4">
        <h2 id="recent-characters" className="font-heading text-lg font-semibold">
          {t.recentTitle}
        </h2>
        <EmptyState icon={BookUser} title={t.emptyTitle} description={t.emptyBody} />
      </section>
    </div>
  );
}
