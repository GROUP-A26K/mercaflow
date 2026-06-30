import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createAdminGraphQLClient,
  streamTextFromUrl,
} from "@/lib/shopify/admin-graphql";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createAdminGraphQLClient", () => {
  it("appelle l'endpoint Admin pinné avec le token et le corps GraphQL", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { ok: true } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createAdminGraphQLClient({
      shop: "acme.myshopify.com",
      accessToken: "shpat_token",
      apiVersion: "2026-04",
    });
    // `query` renvoie l'enveloppe GraphQL complète (data + errors éventuelles) —
    // les parseurs de bulk.ts consomment `.data` / `.errors`.
    const response = await client.query<{ data: { ok: boolean } }>(
      "query { ok }",
      { a: 1 },
    );

    expect(response).toEqual({ data: { ok: true } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "https://acme.myshopify.com/admin/api/2026-04/graphql.json",
    );
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["X-Shopify-Access-Token"]).toBe("shpat_token");
    expect(JSON.parse(init?.body as string)).toEqual({
      query: "query { ok }",
      variables: { a: 1 },
    });
  });

  it("lève sur une réponse HTTP non-OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 401 })),
    );
    const client = createAdminGraphQLClient({
      shop: "acme.myshopify.com",
      accessToken: "bad",
      apiVersion: "2026-04",
    });
    await expect(client.query("query { ok }")).rejects.toThrow(/401/);
  });
});

describe("streamTextFromUrl", () => {
  it("lit un corps de réponse en chunks de texte", async () => {
    const body = "line1\nline2\n";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { status: 200 })),
    );
    let collected = "";
    for await (const chunk of streamTextFromUrl(
      "https://example/result.jsonl",
    )) {
      collected += chunk;
    }
    expect(collected).toBe(body);
  });

  it("lève si le téléchargement échoue", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    );
    await expect(async () => {
      for await (const _ of streamTextFromUrl("https://example/x")) {
        void _;
      }
    }).rejects.toThrow(/404/);
  });
});
