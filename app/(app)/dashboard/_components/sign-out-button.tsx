"use client";

import { SignOutButton as ClerkSignOutButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";

// Feuille interactive 'use client'. `SignOutButton` de Clerk gère la déconnexion
// puis redirige vers `/`. On lui passe notre bouton shadcn comme enfant.
export function SignOutButton() {
  return (
    <ClerkSignOutButton redirectUrl="/">
      <Button type="button" variant="outline" size="sm">
        Se déconnecter
      </Button>
    </ClerkSignOutButton>
  );
}
