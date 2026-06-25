import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";

// Tests UNITAIRES / COMPOSANTS (rapides, isolés). Les tests fonctionnels e2e
// vivent dans tests/e2e et tournent sous Playwright (voir playwright.config.ts).
// Résolution de l'alias `@/*` : native via resolve.tsconfigPaths (lit tsconfig.json).
export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
  },
});
