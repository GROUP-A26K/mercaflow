"use client";

import { useActionState } from "react";
import { IconArrowRight, IconCircleCheck } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT_MESSAGE_MAX } from "@/lib/validations/contact";

import { submitContactAction, type ContactFormState } from "../_actions";

const initialState: ContactFormState = { status: "idle" };

function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {error}
    </p>
  );
}

export function ContactForm() {
  const [state, action, pending] = useActionState(
    submitContactAction,
    initialState,
  );

  if (state.status === "success") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary/10">
          <IconCircleCheck className="size-6 text-primary" />
        </span>
        <h3 className="font-heading text-lg font-semibold tracking-tight">
          Message sent
        </h3>
        <p className="max-w-sm text-sm text-pretty text-muted-foreground">
          {state.message}
        </p>
      </div>
    );
  }

  const errors = state.fieldErrors;

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            placeholder="Jane Doe"
            aria-invalid={errors?.name ? true : undefined}
            aria-describedby={errors?.name ? "name-error" : undefined}
          />
          <FieldError id="name-error" error={errors?.name} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="jane@brand.com"
            aria-invalid={errors?.email ? true : undefined}
            aria-describedby={errors?.email ? "email-error" : undefined}
          />
          <FieldError id="email-error" error={errors?.email} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="company">
          Company <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="company"
          name="company"
          autoComplete="organization"
          placeholder="Brand or agency"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="message">Message</Label>
        <Textarea
          id="message"
          name="message"
          rows={5}
          maxLength={CONTACT_MESSAGE_MAX}
          placeholder="Tell us about your catalog and what you want to achieve."
          aria-invalid={errors?.message ? true : undefined}
          aria-describedby={errors?.message ? "message-error" : undefined}
        />
        <FieldError id="message-error" error={errors?.message} />
      </div>

      {state.status === "error" && !errors ? (
        <p className="text-sm text-destructive">{state.message}</p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Sending..." : "Send message"}
        {!pending ? <IconArrowRight /> : null}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        We will only use your details to reply. No spam, ever.
      </p>
    </form>
  );
}
