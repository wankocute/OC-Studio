import { Compass } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { messages } from "@/i18n";

export default function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <EmptyState
        icon={Compass}
        title={messages.notFound.title}
        description={messages.notFound.body}
        className="w-full max-w-lg"
        action={
          <Button asChild variant="outline">
            <Link href="/">{messages.notFound.back}</Link>
          </Button>
        }
      />
    </main>
  );
}
