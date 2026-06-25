"use client";

import * as React from "react";

// Point d'entrée unique des providers CLIENT (theme, react-query, etc.).
// Pattern Next 16 : le Context React n'existe pas dans les Server Components, donc on
// regroupe les providers dans ce composant client, monté une fois dans le root layout
// autour de {children}. Ajouter les providers ici au fur et à mesure.
export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
