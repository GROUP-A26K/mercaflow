import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as Sentry from "@sentry/nextjs";

import AppError from "@/app/(app)/error";
import ErrorPage from "@/app/error";
import GlobalError from "@/app/global-error";

// On isole les boundaries de Sentry : seul le contrat « captureException est
// appelé avec l'erreur » nous intéresse (le SDK est no-op sans DSN de toute façon).
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

const captureException = vi.mocked(Sentry.captureException);

describe("error boundaries → Sentry", () => {
  beforeEach(() => {
    captureException.mockClear();
  });

  const boundaries = [
    { name: "app/error.tsx", Component: ErrorPage },
    { name: "app/(app)/error.tsx", Component: AppError },
    { name: "app/global-error.tsx", Component: GlobalError },
  ] as const;

  it.each(boundaries)("$name remonte l'erreur à Sentry", ({ Component }) => {
    const error = new Error("boom");
    render(<Component error={error} unstable_retry={() => {}} />);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(error);
  });

  it.each(boundaries)(
    "$name déclenche unstable_retry au clic sur Réessayer",
    async ({ Component }) => {
      const unstable_retry = vi.fn();
      render(
        <Component error={new Error("boom")} unstable_retry={unstable_retry} />,
      );

      screen.getByRole("button", { name: "Réessayer" }).click();
      expect(unstable_retry).toHaveBeenCalledTimes(1);
    },
  );
});
