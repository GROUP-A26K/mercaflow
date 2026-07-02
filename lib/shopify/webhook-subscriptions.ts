import "server-only";

import type { AdminGraphQLClient } from "@/lib/shopify/admin-graphql";

// Abonnement aux webhooks incrémentaux Shopify (MER-27). Enregistrés paresseusement (au
// démarrage de l'ingestion, comme le webhook `bulk_operations/finish`) plutôt qu'à l'OAuth :
// les mises à jour n'ont d'intérêt qu'une fois le catalogue importé. Idempotent : on liste
// les abonnements existants et on ne crée que les topics manquants pointant vers NOTRE URL.

/** Topics écoutés (enum `WebhookSubscriptionTopic` de l'Admin API). */
export const INCREMENTAL_WEBHOOK_TOPICS = [
  "PRODUCTS_CREATE",
  "PRODUCTS_UPDATE",
  "PRODUCTS_DELETE",
  "INVENTORY_LEVELS_UPDATE",
  "APP_UNINSTALLED",
] as const;

/** Chemin du endpoint unique qui reçoit tous les webhooks incrémentaux (cf. proxy.ts). */
export const INCREMENTAL_WEBHOOK_PATH = "/api/shopify/webhooks";

// `first: 250` = max d'une connexion GraphQL → couvre largement nos quelques topics.
export const INCREMENTAL_WEBHOOKS_QUERY = `query IncrementalWebhooks {
  webhookSubscriptions(first: 250, topics: [PRODUCTS_CREATE, PRODUCTS_UPDATE, PRODUCTS_DELETE, INVENTORY_LEVELS_UPDATE, APP_UNINSTALLED]) {
    edges {
      node {
        id
        topic
        endpoint {
          __typename
          ... on WebhookHttpEndpoint { callbackUrl }
        }
      }
    }
  }
}`;

export const WEBHOOK_SUBSCRIPTION_CREATE_BY_TOPIC_MUTATION = `mutation CreateWebhook($topic: WebhookSubscriptionTopic!, $callbackUrl: URL!) {
  webhookSubscriptionCreate(
    topic: $topic
    webhookSubscription: { callbackUrl: $callbackUrl, format: JSON }
  ) {
    webhookSubscription { id }
    userErrors { field message }
  }
}`;

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

interface UserError {
  field?: string[] | null;
  message: string;
}

function assertNoGraphQLErrors(response: GraphQLResponse<unknown>): void {
  if (response.errors && response.errors.length > 0) {
    const messages = response.errors.map((error) => error.message).join("; ");
    throw new Error(`Erreur GraphQL Shopify : ${messages}`);
  }
}

/** Topics déjà abonnés vers `callbackUrl` (les abonnements d'autres URLs sont ignorés). */
export function parseSubscribedTopics(
  payload: unknown,
  callbackUrl: string,
): Set<string> {
  const response = payload as GraphQLResponse<{
    webhookSubscriptions: {
      edges: {
        node: {
          topic: string;
          endpoint: { __typename: string; callbackUrl?: string };
        };
      }[];
    };
  }>;
  assertNoGraphQLErrors(response);
  const edges = response.data?.webhookSubscriptions?.edges ?? [];
  const subscribed = new Set<string>();
  for (const { node } of edges) {
    if (node.endpoint.callbackUrl === callbackUrl) subscribed.add(node.topic);
  }
  return subscribed;
}

/** Valide la réponse d'un `webhookSubscriptionCreate` (erreurs GraphQL + userErrors). */
export function parseWebhookCreateResult(payload: unknown): void {
  const response = payload as GraphQLResponse<{
    webhookSubscriptionCreate: {
      webhookSubscription: { id: string } | null;
      userErrors: UserError[];
    };
  }>;
  assertNoGraphQLErrors(response);
  const userErrors = response.data?.webhookSubscriptionCreate?.userErrors ?? [];
  if (userErrors.length > 0) {
    throw new Error(
      `Abonnement webhook rejeté : ${userErrors.map((e) => e.message).join("; ")}`,
    );
  }
}

/**
 * Garantit l'abonnement à tous les topics incrémentaux vers `callbackUrl`. Idempotent :
 * ne recrée pas un abonnement existant. À appeler au démarrage de l'ingestion.
 */
export async function ensureIncrementalWebhooks(
  client: AdminGraphQLClient,
  callbackUrl: string,
): Promise<void> {
  const subscribed = parseSubscribedTopics(
    await client.query(INCREMENTAL_WEBHOOKS_QUERY),
    callbackUrl,
  );
  const missing = INCREMENTAL_WEBHOOK_TOPICS.filter(
    (topic) => !subscribed.has(topic),
  );
  for (const topic of missing) {
    parseWebhookCreateResult(
      await client.query(WEBHOOK_SUBSCRIPTION_CREATE_BY_TOPIC_MUTATION, {
        topic,
        callbackUrl,
      }),
    );
  }
}
