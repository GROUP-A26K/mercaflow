import { SignUp } from "@clerk/nextjs";

import { buildMetadata } from "@/lib/seo/metadata";

// Catch-all requis par Clerk ([[...sign-up]]) → /sign-up. Page d'auth : non indexée.
export const metadata = buildMetadata({
  title: "Inscription",
  path: "/sign-up",
  noIndex: true,
});

export default function SignUpPage() {
  return (
    <main className="flex min-h-svh items-center justify-center px-6 py-12">
      <SignUp />
    </main>
  );
}
