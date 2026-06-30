import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  BULK_CATALOG_QUERY,
  isBulkOperationRunning,
  parseBulkOperationNode,
  parseBulkOperationRunResult,
  parseCurrentBulkOperation,
  parseExistingBulkFinishWebhook,
} from "@/lib/shopify/bulk";

describe("BULK_CATALOG_QUERY", () => {
  it("interroge products + variants + metafields (au moins une connexion)", () => {
    expect(BULK_CATALOG_QUERY).toMatch(/products/);
    expect(BULK_CATALOG_QUERY).toMatch(/variants/);
    expect(BULK_CATALOG_QUERY).toMatch(/metafields/);
  });

  it("respecte les limites bulk : ≤ 5 connexions et imbrication ≤ 2 niveaux sous la racine", () => {
    // `edges {` marque chaque connexion dans la requête bulk.
    const connections = (BULK_CATALOG_QUERY.match(/edges\s*\{/g) ?? []).length;
    expect(connections).toBeGreaterThanOrEqual(1);
    expect(connections).toBeLessThanOrEqual(5);

    // Profondeur d'imbrication des connexions : on suit la pile d'accolades et on compte
    // celles ouvertes juste après un `edges`. La racine (products) compte 1 → la limite
    // Shopify « 2 niveaux sous la racine » = profondeur max d'`edges` imbriqués ≤ 3.
    const tokens = BULK_CATALOG_QUERY.match(/[A-Za-z_]+|[{}]/g) ?? [];
    const stack: boolean[] = [];
    let lastWord = "";
    let maxDepth = 0;
    for (const token of tokens) {
      if (token === "{") {
        stack.push(lastWord === "edges");
        const depth = stack.filter(Boolean).length;
        if (depth > maxDepth) maxDepth = depth;
      } else if (token === "}") {
        stack.pop();
      } else {
        lastWord = token;
      }
    }
    expect(maxDepth).toBeLessThanOrEqual(3);
  });
});

describe("parseBulkOperationRunResult", () => {
  it("renvoie l'opération créée", () => {
    const op = parseBulkOperationRunResult({
      data: {
        bulkOperationRunQuery: {
          bulkOperation: {
            id: "gid://shopify/BulkOperation/1",
            status: "CREATED",
          },
          userErrors: [],
        },
      },
    });
    expect(op).toEqual({
      id: "gid://shopify/BulkOperation/1",
      status: "CREATED",
    });
  });

  it("lève sur userErrors (ex. bulk déjà en cours)", () => {
    expect(() =>
      parseBulkOperationRunResult({
        data: {
          bulkOperationRunQuery: {
            bulkOperation: null,
            userErrors: [
              {
                field: null,
                message: "A bulk query operation is already running.",
              },
            ],
          },
        },
      }),
    ).toThrow(/already running/);
  });

  it("lève sur des erreurs GraphQL de haut niveau", () => {
    expect(() =>
      parseBulkOperationRunResult({
        errors: [{ message: "Throttled" }],
      }),
    ).toThrow(/Throttled/);
  });
});

describe("parseCurrentBulkOperation", () => {
  it("renvoie l'opération courante avec son url", () => {
    const op = parseCurrentBulkOperation({
      data: {
        currentBulkOperation: {
          id: "gid://shopify/BulkOperation/1",
          status: "COMPLETED",
          errorCode: null,
          url: "https://storage.example/result.jsonl",
          objectCount: "1200",
        },
      },
    });
    expect(op?.status).toBe("COMPLETED");
    expect(op?.url).toBe("https://storage.example/result.jsonl");
  });

  it("renvoie null quand il n'y a pas d'opération", () => {
    expect(
      parseCurrentBulkOperation({ data: { currentBulkOperation: null } }),
    ).toBeNull();
  });
});

describe("parseBulkOperationNode", () => {
  it("renvoie l'opération ciblée par son id", () => {
    const op = parseBulkOperationNode({
      data: {
        node: {
          id: "gid://shopify/BulkOperation/9",
          status: "COMPLETED",
          errorCode: null,
          url: "https://storage.example/result.jsonl",
          objectCount: "500",
        },
      },
    });
    expect(op?.id).toBe("gid://shopify/BulkOperation/9");
    expect(op?.url).toBe("https://storage.example/result.jsonl");
  });

  it("renvoie null si le node est introuvable", () => {
    expect(parseBulkOperationNode({ data: { node: null } })).toBeNull();
  });
});

describe("isBulkOperationRunning", () => {
  it.each([
    ["CREATED", true],
    ["RUNNING", true],
    ["CANCELING", true],
    ["COMPLETED", false],
    ["FAILED", false],
    ["CANCELED", false],
    ["EXPIRED", false],
  ])("%s → %s", (status, expected) => {
    expect(isBulkOperationRunning(status)).toBe(expected);
  });
});

describe("parseExistingBulkFinishWebhook", () => {
  it("retrouve un abonnement existant pointant vers notre callback", () => {
    const id = parseExistingBulkFinishWebhook(
      {
        data: {
          webhookSubscriptions: {
            edges: [
              {
                node: {
                  id: "gid://shopify/WebhookSubscription/9",
                  endpoint: {
                    __typename: "WebhookHttpEndpoint",
                    callbackUrl:
                      "https://app.mercaflow.ai/api/shopify/webhooks/bulk-operations-finish",
                  },
                },
              },
            ],
          },
        },
      },
      "https://app.mercaflow.ai/api/shopify/webhooks/bulk-operations-finish",
    );
    expect(id).toBe("gid://shopify/WebhookSubscription/9");
  });

  it("renvoie null si aucun abonnement ne correspond au callback", () => {
    const id = parseExistingBulkFinishWebhook(
      {
        data: {
          webhookSubscriptions: {
            edges: [
              {
                node: {
                  id: "gid://shopify/WebhookSubscription/9",
                  endpoint: {
                    __typename: "WebhookHttpEndpoint",
                    callbackUrl: "https://other.example/hook",
                  },
                },
              },
            ],
          },
        },
      },
      "https://app.mercaflow.ai/api/shopify/webhooks/bulk-operations-finish",
    );
    expect(id).toBeNull();
  });
});
