import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  collectJsonlStream,
  parseJsonlLine,
  reconstructTree,
  streamJsonlNodes,
  type BulkNode,
} from "@/lib/shopify/jsonl";

/** Transforme une chaîne en flux de chunks texte (pour simuler une réponse réseau). */
async function* chunksOf(text: string, size = 7): AsyncIterable<string> {
  for (let i = 0; i < text.length; i += size) {
    yield text.slice(i, i + size);
  }
}

describe("parseJsonlLine", () => {
  it("parse une ligne JSON en nœud", () => {
    const node = parseJsonlLine('{"id":"gid://shopify/Product/1","title":"A"}');
    expect(node).toEqual({ id: "gid://shopify/Product/1", title: "A" });
  });

  it("rejette une ligne sans champ id", () => {
    expect(() => parseJsonlLine('{"title":"A"}')).toThrow(/id/);
  });

  it("rejette du JSON malformé", () => {
    expect(() => parseJsonlLine("{not json}")).toThrow();
  });
});

describe("streamJsonlNodes", () => {
  const jsonl = [
    '{"id":"gid://shopify/Product/1","title":"Chaise"}',
    '{"id":"gid://shopify/ProductVariant/11","sku":"CH-1","__parentId":"gid://shopify/Product/1"}',
    "", // ligne vide (fin de fichier) → ignorée
    '{"id":"gid://shopify/Product/2","title":"Table"}',
  ].join("\n");

  it("découpe le JSONL en nœuds même quand les chunks coupent une ligne", async () => {
    const nodes: BulkNode[] = [];
    for await (const node of streamJsonlNodes(chunksOf(jsonl, 5))) {
      nodes.push(node);
    }
    expect(nodes.map((n) => n.id)).toEqual([
      "gid://shopify/Product/1",
      "gid://shopify/ProductVariant/11",
      "gid://shopify/Product/2",
    ]);
  });

  it("ignore les lignes vides et l'absence de newline final", async () => {
    const collected = await collectJsonlStream(chunksOf(jsonl, 1000));
    expect(collected).toHaveLength(3);
  });

  it("propage une erreur de parsing avec le numéro de ligne", async () => {
    const bad = '{"id":"ok"}\n{oops}';
    await expect(collectJsonlStream(chunksOf(bad))).rejects.toThrow(/ligne 2/);
  });
});

describe("reconstructTree", () => {
  it("imbrique les enfants sous leur parent via __parentId", () => {
    const flat: BulkNode[] = [
      { id: "gid://shopify/Product/1", title: "Chaise" },
      {
        id: "gid://shopify/ProductVariant/11",
        sku: "CH-1",
        __parentId: "gid://shopify/Product/1",
      },
      {
        id: "gid://shopify/ProductVariant/12",
        sku: "CH-2",
        __parentId: "gid://shopify/Product/1",
      },
      {
        id: "gid://shopify/Metafield/100",
        key: "material",
        __parentId: "gid://shopify/Product/1",
      },
      { id: "gid://shopify/Product/2", title: "Table" },
    ];

    const roots = reconstructTree(flat);

    expect(roots).toHaveLength(2);
    expect(roots[0].id).toBe("gid://shopify/Product/1");
    expect(roots[0].__children.map((c) => c.id)).toEqual([
      "gid://shopify/ProductVariant/11",
      "gid://shopify/ProductVariant/12",
      "gid://shopify/Metafield/100",
    ]);
    expect(roots[1].__children).toHaveLength(0);
  });

  it("rattache un enfant même si le parent apparaît après lui (ordre indifférent)", () => {
    const flat: BulkNode[] = [
      {
        id: "gid://shopify/ProductVariant/11",
        __parentId: "gid://shopify/Product/1",
      },
      { id: "gid://shopify/Product/1" },
    ];
    const roots = reconstructTree(flat);
    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe("gid://shopify/Product/1");
    expect(roots[0].__children[0].id).toBe("gid://shopify/ProductVariant/11");
  });

  it("imbrique sur plusieurs niveaux (metafield sous variant sous product)", () => {
    const flat: BulkNode[] = [
      { id: "gid://shopify/Product/1" },
      {
        id: "gid://shopify/ProductVariant/11",
        __parentId: "gid://shopify/Product/1",
      },
      {
        id: "gid://shopify/Metafield/100",
        __parentId: "gid://shopify/ProductVariant/11",
      },
    ];
    const roots = reconstructTree(flat);
    expect(roots[0].__children[0].__children[0].id).toBe(
      "gid://shopify/Metafield/100",
    );
  });

  it("traite un enfant orphelin (parent absent) comme une racine", () => {
    const flat: BulkNode[] = [
      {
        id: "gid://shopify/ProductVariant/11",
        __parentId: "gid://shopify/Product/999",
      },
    ];
    const roots = reconstructTree(flat);
    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe("gid://shopify/ProductVariant/11");
  });
});
