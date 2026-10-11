"use client";

import { LoaderCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState, useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { messages } from "@/i18n";

import { loginAction } from "../actions";

const t = messages.auth;

/** `next` is request data; isolating it keeps the rest of the form in the static shell. */
function NextPathField() {
  const next = useSearchParams().get("next");
  return next ? <input type="hidden" name="next" value={next} /> : null;
}

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, null);
  const id = useId();
  const error = state && !state.ok ? state.error.message : undefined;

  return (
    <form action={formAction} className="space-y-4">
      <Suspense fallback={null}>
        <NextPathField />
      </Suspense>
      <div className="space-y-2">
        <Label htmlFor={`${id}-password`}>{t.password}</Label>
        <Input
          id={`${id}-password`}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          disabled={pending}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {error ? (
          <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
        {pending ? t.submitting : t.submit}
      </Button>
    </form>
  );
}
