"use client";

import * as React from "react";

const MOBILE_BREAKPOINT = 768;

const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(query);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/**
 * `true` si le viewport est sous le breakpoint mobile (768px).
 * Implémenté avec `useSyncExternalStore` (pas d'effet ni de setState) → évite le warning
 * react-hooks `set-state-in-effect` ; côté serveur le snapshot vaut `false`.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT, // snapshot client
    () => false, // snapshot serveur
  );
}
