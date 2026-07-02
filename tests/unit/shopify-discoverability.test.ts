import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  fetchDiscoverability,
  parseDiscoverability,
} from "@/lib/shopify/discoverability";

describe("parseDiscoverability", () => {
  it("détecte un JSON-LD Product (schema.org)", () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"X"}</script>
      <meta property="og:title" content="X" />
    </head></html>`;
    expect(parseDiscoverability(html)).toEqual({
      jsonLdProduct: true,
      openGraph: true,
      indexable: true,
    });
  });

  it("détecte noindex → non indexable", () => {
    const html = `<head><meta name="robots" content="noindex, nofollow"></head>`;
    expect(parseDiscoverability(html).indexable).toBe(false);
  });

  it("absence de JSON-LD Product et d'OG → false", () => {
    const html = `<html><head><title>rien</title></head></html>`;
    const sig = parseDiscoverability(html);
    expect(sig.jsonLdProduct).toBe(false);
    expect(sig.openGraph).toBe(false);
    expect(sig.indexable).toBe(true);
  });

  it("ignore un JSON-LD non-Product", () => {
    const html = `<script type="application/ld+json">{"@type":"BreadcrumbList"}</script>`;
    expect(parseDiscoverability(html).jsonLdProduct).toBe(false);
  });
});

describe("fetchDiscoverability", () => {
  it("renvoie null si l'URL est absente (sans fetch)", async () => {
    expect(await fetchDiscoverability(null)).toBeNull();
  });

  it("renvoie null si la réponse n'est pas ok", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      text: async () => "",
    }));
    expect(await fetchDiscoverability("https://x/p", fetchImpl)).toBeNull();
  });

  it("renvoie null sur exception réseau (best-effort, pas de throw)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network");
    });
    expect(await fetchDiscoverability("https://x/p", fetchImpl)).toBeNull();
  });

  it("parse le HTML récupéré en signal", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      text: async () =>
        `<script type="application/ld+json">{"@type":"Product"}</script>`,
    }));
    expect(await fetchDiscoverability("https://x/p", fetchImpl)).toEqual({
      jsonLdProduct: true,
      openGraph: false,
      indexable: true,
    });
  });
});
