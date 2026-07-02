import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IngestButton } from "@/app/(app)/dashboard/_components/ingest-button";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("IngestButton", () => {
  it("POST same-origin vers /api/shopify/ingest en ciblant la boutique", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));
    render(<IngestButton shopDomain="acme.myshopify.com" />);

    fireEvent.click(
      screen.getByRole("button", { name: "Importer le catalogue" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    // URL relative → same-origin (le navigateur pose Sec-Fetch-Site: same-origin).
    expect(url).toBe("/api/shopify/ingest?shop=acme.myshopify.com");
    expect(init).toEqual({ method: "POST" });
  });

  it("encode le domaine dans le query param", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));
    render(<IngestButton shopDomain="a b.myshopify.com" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/shopify/ingest?shop=a%20b.myshopify.com",
    );
  });

  it("affiche un message de succès sur 202 (import lancé)", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));
    render(<IngestButton shopDomain="acme.myshopify.com" />);
    fireEvent.click(screen.getByRole("button"));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/import lancé/i);
    expect(status).toHaveClass("text-muted-foreground");
  });

  it("affiche un message d'erreur dédié sur 409 (bulk déjà en cours)", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 409 }));
    render(<IngestButton shopDomain="acme.myshopify.com" />);
    fireEvent.click(screen.getByRole("button"));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/déjà en cours/i);
    expect(status).toHaveClass("text-destructive");
  });

  it("retombe sur un message d'erreur générique sur 5xx inconnu", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 502 }));
    render(<IngestButton shopDomain="acme.myshopify.com" />);
    fireEvent.click(screen.getByRole("button"));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/échec du lancement/i);
    expect(status).toHaveClass("text-destructive");
  });

  it("gère un rejet réseau sans avaler l'erreur", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    render(<IngestButton shopDomain="acme.myshopify.com" />);
    fireEvent.click(screen.getByRole("button"));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/impossible de contacter le serveur/i);
  });
});
