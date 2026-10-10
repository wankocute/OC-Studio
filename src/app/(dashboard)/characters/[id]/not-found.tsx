import { UserX } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { messages } from "@/i18n";

export default function CharacterNotFound() {
  return (
    <EmptyState
      icon={UserX}
      title={messages.characters.notFoundTitle}
      description={messages.characters.notFoundBody}
      action={
        <Button asChild variant="outline">
          <Link href="/characters">{messages.characters.backToLibrary}</Link>
        </Button>
      }
    />
  );
}
