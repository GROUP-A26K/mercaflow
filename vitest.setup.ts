// Étend `expect` avec les matchers DOM (toBeInTheDocument, toHaveAttribute, …).
import "@testing-library/jest-dom/vitest";

import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Démonte le DOM rendu après chaque test (sinon les rendus s'accumulent entre tests).
afterEach(() => {
  cleanup();
});
