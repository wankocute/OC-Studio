import { Feather } from "lucide-react";
import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/features/auth/components/login-form";
import { messages } from "@/i18n";

export const metadata: Metadata = { title: messages.auth.title };

/** Reachable without a session (see `src/proxy.ts`); signed-in visitors are sent to `/`. */
export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <span className="mx-auto mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Feather className="size-5" aria-hidden />
          </span>
          <CardTitle>
            <h1 className="font-heading text-2xl font-semibold">{messages.app.name}</h1>
          </CardTitle>
          <CardDescription>{messages.auth.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
