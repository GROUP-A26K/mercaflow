"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { sendTestEmail, type TestEmailState } from "../_actions";

export function TestEmailButton() {
  // `sendTestEmail` ignore (prevState, formData) → passable directement à useActionState.
  const [state, formAction, pending] = useActionState<TestEmailState>(
    sendTestEmail,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <Button type="submit" disabled={pending}>
        {pending ? "Envoi…" : "Envoyer un email de test"}
      </Button>
      {state ? (
        <p
          className={
            state.ok
              ? "text-muted-foreground text-sm"
              : "text-destructive text-sm"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
