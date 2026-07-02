import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AdminGraphQLClient } from "@/lib/shopify/admin-graphql";
import {
  ensureIncrementalWebhooks,
  INCREMENTAL_WEBHOOK_TOPICS,
  parseSubscribedTopics,
  parseWebhookCreateResult,
} from "@/lib/shopify/webhook-subscriptions";

const CALLBACK = "https://app.example.com/api/shopify/webhooks";

function edge(topic: string, callbackUrl: string) {
  return {
    node: {
      id: `gid://shopify/WebhookSubscription/${topic}`,
      topic,
      endpoint: { __typename: "WebhookHttpEndpoint", callbackUrl },
    },
  };
}

describe("parseSubscribedTopics", () => {
  it("ne retient que les topics pointant vers notre callbackUrl", () => {
    const payload = {
      data: {
        webhookSubscriptions: {
          edges: [
            edge("PRODUCTS_UPDATE", CALLBACK),
            edge("PRODUCTS_CREATE", "https://autre.example.com/webhooks"),
          ],
        },
      },
    };
    const subscribed = parseSubscribedTopics(payload, CALLBACK);
    expect(subscribed.has("PRODUCTS_UPDATE")).toBe(true);
    expect(subscribed.has("PRODUCTS_CREATE")).toBe(false);
  });

  it("renvoie un ensemble vide si aucun abonnement", () => {
    const payload = { data: { webhookSubscriptions: { edges: [] } } };
    expect(parseSubscribedTopics(payload, CALLBACK).size).toBe(0);
  });

  it("lève sur une erreur GraphQL de haut niveau", () => {
    expect(() =>
      parseSubscribedTopics({ errors: [{ message: "throttled" }] }, CALLBACK),
    ).toThrow(/throttled/);
  });
});

describe("parseWebhookCreateResult", () => {
  it("passe sur une création sans erreur", () => {
    expect(() =>
      parseWebhookCreateResult({
        data: {
          webhookSubscriptionCreate: {
            webhookSubscription: { id: "gid://shopify/WebhookSubscription/1" },
            userErrors: [],
          },
        },
      }),
    ).not.toThrow();
  });

  it("lève sur un vrai userError de création", () => {
    expect(() =>
      parseWebhookCreateResult({
        data: {
          webhookSubscriptionCreate: {
            webhookSubscription: null,
            userErrors: [{ field: ["callbackUrl"], message: "is invalid" }],
          },
        },
      }),
    ).toThrow(/is invalid/);
  });

  it("tolère un doublon (course concurrente) comme succès idempotent", () => {
    expect(() =>
      parseWebhookCreateResult({
        data: {
          webhookSubscriptionCreate: {
            webhookSubscription: null,
            userErrors: [
              {
                field: ["topic"],
                message: "Address for this topic has already been taken",
              },
            ],
          },
        },
      }),
    ).not.toThrow();
  });

  it("lève sur un faux succès (ni id ni userError)", () => {
    expect(() =>
      parseWebhookCreateResult({
        data: {
          webhookSubscriptionCreate: {
            webhookSubscription: null,
            userErrors: [],
          },
        },
      }),
    ).toThrow(/sans subscription id/);
  });

  it("lève sur une erreur GraphQL de haut niveau", () => {
    expect(() =>
      parseWebhookCreateResult({ errors: [{ message: "bad query" }] }),
    ).toThrow(/bad query/);
  });
});

describe("ensureIncrementalWebhooks", () => {
  it("ne crée que les topics manquants (idempotent)", async () => {
    // Déjà abonné à PRODUCTS_UPDATE ; les autres doivent être créés.
    const created: string[] = [];
    const client: AdminGraphQLClient = {
      shop: "boutique.myshopify.com",
      async query<T>(
        query: string,
        variables?: Record<string, unknown>,
      ): Promise<T> {
        if (query.includes("webhookSubscriptions(")) {
          return {
            data: {
              webhookSubscriptions: {
                edges: [edge("PRODUCTS_UPDATE", CALLBACK)],
              },
            },
          } as T;
        }
        created.push(variables?.topic as string);
        return {
          data: {
            webhookSubscriptionCreate: {
              webhookSubscription: {
                id: "gid://shopify/WebhookSubscription/x",
              },
              userErrors: [],
            },
          },
        } as T;
      },
    };

    await ensureIncrementalWebhooks(client, CALLBACK);

    // Un create par topic manquant, aucun pour celui déjà abonné.
    expect(created).not.toContain("PRODUCTS_UPDATE");
    expect(new Set(created)).toEqual(
      new Set(
        INCREMENTAL_WEBHOOK_TOPICS.filter((t) => t !== "PRODUCTS_UPDATE"),
      ),
    );
  });

  it("ne crée rien si tout est déjà abonné", async () => {
    const client: AdminGraphQLClient = {
      shop: "boutique.myshopify.com",
      async query<T>(query: string): Promise<T> {
        if (query.includes("webhookSubscriptions(")) {
          return {
            data: {
              webhookSubscriptions: {
                edges: INCREMENTAL_WEBHOOK_TOPICS.map((t) => edge(t, CALLBACK)),
              },
            },
          } as T;
        }
        throw new Error("ne devrait pas créer d'abonnement");
      },
    };
    await expect(
      ensureIncrementalWebhooks(client, CALLBACK),
    ).resolves.toBeUndefined();
  });
});
