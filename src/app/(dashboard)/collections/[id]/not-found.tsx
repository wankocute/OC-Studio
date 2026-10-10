import { LibraryBig } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { messages } from "@/i18n";

export default function CollectionNotFound() {
  return (
    <EmptyState
      icon={LibraryBig}
      title={messages.collections.notFoundTitle}
      description={messages.notFound.body}
      action={
        <Button asChild variant="outline">
          <Link href="/collections">{messages.collections.title}</Link>
        </Button>
      }
    />
  );
}
