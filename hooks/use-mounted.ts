"use client";

import * as React from "react";

const subscribe = () => () => {};

/**
 * Retourne `true` une fois monté côté client, `false` au rendu serveur.
 * Implémenté avec `useSyncExternalStore` (pas d'effet ni de setState) → évite à la fois
 * les mismatchs d'hydratation et le warning react-hooks `set-state-in-effect`.
 */
export function useMounted() {
  return React.useSyncExternalStore(
    subscribe,
    () => true, // snapshot client
    () => false, // snapshot serveur
  );
}
