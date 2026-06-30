import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AdminGraphQLClient } from "@/lib/shopify/admin-graphql";
import type { ShopifyConnection } from "@/lib/data/shopify-connections";
import {
  BulkAlreadyRunningError,
  processBulkOperationFinish,
  startCatalogIngestion,
} from "@/lib/shopify/ingestion";
import { RAW_RECORDS_BATCH_SIZE } from "@/lib/data/raw-records";

const CALLBACK =
  "https://app.mercaflow.ai/api/shopify/webhooks/bulk-operations-finish";

const connection: ShopifyConnection = {
  id: "conn-1",
  orgId: "org_1",
  shopDomain: "acme.myshopify.com",
  accessTokenEnc: "enc",
  scope: "read_products",
  status: "active",
};

/** Client GraphQL factice : route par contenu de la requête. */
function fakeClient(
  handlers: Partial<{
    listWebhooks: () => unknown;
    createWebhook: () => unknown;
    current: () => unknown;
    run: () => unknown;
  }>,
): { client: AdminGraphQLClient; calls: string[] } {
  const calls: string[] = [];
  const client: AdminGraphQLClient = {
    shop: connection.shopDomain,
    async query<T>(query: string): Promise<T> {
      if (query.includes("webhookSubscriptions(")) {
        calls.push("listWebhooks");
        return (handlers.listWebhooks?.() ?? {
          data: { webhookSubscriptions: { edges: [] } },
        }) as T;
      }
      if (query.includes("webhookSubscriptionCreate")) {
        calls.push("createWebhook");
        return (handlers.createWebhook?.() ?? {
          data: {
            webhookSubscriptionCreate: {
              webhookSubscription: {
                id: "gid://shopify/WebhookSubscription/1",
              },
              userErrors: [],
            },
          },
        }) as T;
      }
      if (query.includes("currentBulkOperation")) {
        calls.push("current");
        return (handlers.current?.() ?? {
          data: { currentBulkOperation: null },
        }) as T;
      }
      if (query.includes("bulkOperationRunQuery")) {
        calls.push("run");
        return (handlers.run?.() ?? {
          data: {
            bulkOperationRunQuery: {
              bulkOperation: {
                id: "gid://shopify/BulkOperation/9",
                status: "CREATED",
              },
              userErrors: [],
            },
          },
        }) as T;
      }
      throw new Error(`Requête inattendue : ${query}`);
    },
  };
  return { client, calls };
}

describe("startCatalogIngestion", () => {
  it("crée l'abonnement webhook (si absent) puis lance la bulk query", async () => {
    const { client, calls } = fakeClient({});
    const op = await startCatalogIngestion({ client, callbackUrl: CALLBACK });
    expect(op.id).toBe("gid://shopify/BulkOperation/9");
    expect(calls).toEqual(["listWebhooks", "createWebhook", "current", "run"]);
  });

  it("ne recrée pas l'abonnement s'il existe déjà", async () => {
    const { client, calls } = fakeClient({
      listWebhooks: () => ({
        data: {
          webhookSubscriptions: {
            edges: [
              {
                node: {
                  id: "gid://shopify/WebhookSubscription/7",
                  endpoint: {
                    __typename: "WebhookHttpEndpoint",
                    callbackUrl: CALLBACK,
                  },
                },
              },
            ],
          },
        },
      }),
    });
    await startCatalogIngestion({ client, callbackUrl: CALLBACK });
    expect(calls).not.toContain("createWebhook");
  });

  it("refuse de lancer une bulk si une est déjà en cours (1 bulk / shop)", async () => {
    const { client, calls } = fakeClient({
      current: () => ({
        data: {
          currentBulkOperation: {
            id: "gid://shopify/BulkOperation/8",
            status: "RUNNING",
            errorCode: null,
            url: null,
            objectCount: "10",
          },
        },
      }),
    });
    await expect(
      startCatalogIngestion({ client, callbackUrl: CALLBACK }),
    ).rejects.toBeInstanceOf(BulkAlreadyRunningError);
    expect(calls).not.toContain("run");
  });

  it("mappe le userError « already running » de la mutation sur BulkAlreadyRunningError (course)", async () => {
    // Le pré-check passe (pas d'op courante) mais la mutation est rejetée par Shopify.
    const { client } = fakeClient({
      run: () => ({
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
    });
    await expect(
      startCatalogIngestion({ client, callbackUrl: CALLBACK }),
    ).rejects.toBeInstanceOf(BulkAlreadyRunningError);
  });
});

describe("processBulkOperationFinish", () => {
  async function* chunks(text: string): AsyncIterable<string> {
    yield text;
  }

  it("streame le JSONL terminé et insère les raw_records par lots", async () => {
    const jsonl = [
      '{"id":"gid://shopify/Product/1","title":"Chaise"}',
      '{"id":"gid://shopify/ProductVariant/11","__parentId":"gid://shopify/Product/1"}',
      '{"id":"gid://shopify/Product/2","title":"Table"}',
    ].join("\n");
    const { client } = fakeClient({
      current: () => ({
        data: {
          currentBulkOperation: {
            id: "gid://shopify/BulkOperation/9",
            status: "COMPLETED",
            errorCode: null,
            url: "https://storage.example/result.jsonl",
            objectCount: "3",
          },
        },
      }),
    });
    const inserted: unknown[] = [];

    const result = await processBulkOperationFinish({
      client,
      connection,
      streamText: () => chunks(jsonl),
      insert: async (records) => {
        inserted.push(...records);
      },
    });

    expect(result.status).toBe("COMPLETED");
    expect(result.ingested).toBe(3);
    expect(inserted).toHaveLength(3);
    expect((inserted[0] as { org_id: string }).org_id).toBe("org_1");
    expect((inserted[0] as { connection_id: string }).connection_id).toBe(
      "conn-1",
    );
  });

  it("ne télécharge rien quand l'opération n'a pas d'url (catalogue vide)", async () => {
    const { client } = fakeClient({
      current: () => ({
        data: {
          currentBulkOperation: {
            id: "gid://shopify/BulkOperation/9",
            status: "COMPLETED",
            errorCode: null,
            url: null,
            objectCount: "0",
          },
        },
      }),
    });
    const streamText = vi.fn();
    const result = await processBulkOperationFinish({
      client,
      connection,
      streamText: streamText as never,
      insert: async () => {},
    });
    expect(result.ingested).toBe(0);
    expect(streamText).not.toHaveBeenCalled();
  });

  it("remonte un échec de bulk operation sans ingérer", async () => {
    const { client } = fakeClient({
      current: () => ({
        data: {
          currentBulkOperation: {
            id: "gid://shopify/BulkOperation/9",
            status: "FAILED",
            errorCode: "INTERNAL_SERVER_ERROR",
            url: null,
            objectCount: null,
          },
        },
      }),
    });
    const result = await processBulkOperationFinish({
      client,
      connection,
      streamText: () => chunks(""),
      insert: async () => {},
    });
    expect(result.status).toBe("FAILED");
    expect(result.ingested).toBe(0);
    expect(result.errorCode).toBe("INTERNAL_SERVER_ERROR");
  });

  it("n'ingère rien si l'opération courante diffère de celle annoncée (stale/race)", async () => {
    const { client } = fakeClient({
      current: () => ({
        data: {
          currentBulkOperation: {
            id: "gid://shopify/BulkOperation/NOUVELLE",
            status: "COMPLETED",
            errorCode: null,
            url: "https://storage.example/result.jsonl",
            objectCount: "3",
          },
        },
      }),
    });
    const streamText = vi.fn();
    const result = await processBulkOperationFinish({
      client,
      connection,
      expectedOperationId: "gid://shopify/BulkOperation/ATTENDUE",
      streamText: streamText as never,
      insert: async () => {},
    });
    expect(result.status).toBe("stale");
    expect(result.ingested).toBe(0);
    expect(streamText).not.toHaveBeenCalled();
  });

  it("flushe le dernier lot partiel au-delà de la taille de lot", async () => {
    const total = RAW_RECORDS_BATCH_SIZE + 3;
    const jsonl = Array.from(
      { length: total },
      (_unused, i) => `{"id":"gid://shopify/Product/${i}"}`,
    ).join("\n");
    const { client } = fakeClient({
      current: () => ({
        data: {
          currentBulkOperation: {
            id: "gid://shopify/BulkOperation/9",
            status: "COMPLETED",
            errorCode: null,
            url: "https://storage.example/result.jsonl",
            objectCount: String(total),
          },
        },
      }),
    });
    const batchSizes: number[] = [];

    const result = await processBulkOperationFinish({
      client,
      connection,
      streamText: () => chunks(jsonl),
      insert: async (records) => {
        batchSizes.push(records.length);
      },
    });

    // Deux lots : un plein (taille = RAW_RECORDS_BATCH_SIZE) + le reste.
    expect(batchSizes).toEqual([RAW_RECORDS_BATCH_SIZE, 3]);
    expect(result.ingested).toBe(total);
  });
});
