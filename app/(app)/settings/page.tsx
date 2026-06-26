import { buildMetadata } from "@/lib/seo/metadata";

import { TestEmailButton } from "./_components/test-email-button";

export const metadata = buildMetadata({
  title: "Réglages",
  path: "/settings",
  noIndex: true,
});

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-6 py-10">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Réglages
        </h1>
        <p className="text-sm text-muted-foreground">
          Vérifiez l&apos;envoi d&apos;email (Resend) avec un message de test.
        </p>
      </div>

      <TestEmailButton />
    </main>
  );
}
