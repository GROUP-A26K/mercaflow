import { SignIn } from "@clerk/nextjs";

import { buildMetadata } from "@/lib/seo/metadata";

// Catch-all requis par Clerk ([[...sign-in]]) → /sign-in. Page d'auth : non indexée.
export const metadata = buildMetadata({
  title: "Connexion",
  path: "/sign-in",
  noIndex: true,
});

export default function SignInPage() {
  return (
    <main className="flex min-h-svh items-center justify-center px-6 py-12">
      <SignIn />
    </main>
  );
}
