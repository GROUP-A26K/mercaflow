import { beforeEach, describe, expect, it, vi } from "vitest";

// Garde d'accès org-scopée. On isole la logique de `requireOrg` en mockant Clerk et la
// redirection Next. `redirect()` (Next) interrompt l'exécution en lançant : on reproduit
// ce comportement pour vérifier que la garde s'arrête au BON redirect (pas de fall-through).

const authMock = vi.fn();
const redirectMock = vi.fn();

vi.mock("server-only", () => ({}));
// Neutralise la mémoïsation par requête de React.cache (sinon les appels partageraient
// un même résultat entre les tests).
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, cache: (fn: unknown) => fn };
});
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
  currentUser: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    redirectMock(url);
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { requireOrg } from "@/lib/data/auth";

describe("requireOrg", () => {
  beforeEach(() => {
    authMock.mockReset();
    redirectMock.mockReset();
  });

  it("redirige vers /sign-in si non connecté", async () => {
    authMock.mockResolvedValue({ userId: null, orgId: null });
    await expect(requireOrg()).rejects.toThrow("REDIRECT:/sign-in");
    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith("/sign-in");
  });

  it("redirige vers /select-organization sans org active", async () => {
    authMock.mockResolvedValue({ userId: "user_1", orgId: null });
    await expect(requireOrg()).rejects.toThrow("REDIRECT:/select-organization");
    expect(redirectMock).toHaveBeenCalledWith("/select-organization");
  });

  it("renvoie userId + orgId avec une org active", async () => {
    authMock.mockResolvedValue({ userId: "user_1", orgId: "org_1" });
    await expect(requireOrg()).resolves.toEqual({
      userId: "user_1",
      orgId: "org_1",
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
