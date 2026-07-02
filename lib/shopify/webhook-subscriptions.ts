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

// Un abonnement déjà présent (course concurrente, ou abonnement sur une autre URL) n'est PAS
// une erreur de création : l'objectif idempotent est atteint. On tolère ces userErrors.
const DUPLICATE_TOPIC_ERROR =
  /already been taken|already taken|already exists/i;

/** Vrai si un userError Shopify signale un abonnement webhook déjà existant (doublon). */
export function isDuplicateWebhookError(message: string): boolean {
  return DUPLICATE_TOPIC_ERROR.test(message);
}

/** Issue d'une tentative de création : abonnement créé, ou doublon toléré (existe déjà). */
export type WebhookCreateOutcome = "created" | "duplicate";

/**
 * Valide la réponse d'un `webhookSubscriptionCreate`. Lève sur une vraie erreur (GraphQL ou
 * userError non-doublon) ou un faux succès silencieux. Renvoie `"duplicate"` si Shopify a
 * répondu « already taken » : l'appelant peut alors avertir (un doublon signifie que le topic
 * existe sur la boutique mais PAS à notre callbackUrl → il pointe une autre URL).
 */
export function parseWebhookCreateResult(
  payload: unknown,
): WebhookCreateOutcome {
  const response = payload as GraphQLResponse<{
    webhookSubscriptionCreate: {
      webhookSubscription: { id: string } | null;
      userErrors: UserError[];
    };
  }>;
  assertNoGraphQLErrors(response);
  const result = response.data?.webhookSubscriptionCreate;
  const userErrors = result?.userErrors ?? [];
  // On ne lève que sur les VRAIES erreurs de création (les doublons sont tolérés).
  const realErrors = userErrors.filter(
    (error) => !DUPLICATE_TOPIC_ERROR.test(error.message),
  );
  if (realErrors.length > 0) {
    throw new Error(
      `Abonnement webhook rejeté : ${realErrors.map((e) => e.message).join("; ")}`,
    );
  }
  // Doublon : `parseSubscribedTopics` ne l'a pas vu à notre URL → il pointe une AUTRE URL.
  if (userErrors.length > 0) return "duplicate";
  // Garde-fou : ni erreur ni abonnement créé = faux succès silencieux (webhook manquant).
  if (!result?.webhookSubscription?.id) {
    throw new Error(
      "Abonnement webhook : réponse sans subscription id ni userError",
    );
  }
  return "created";
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
    const outcome = parseWebhookCreateResult(
      await client.query(WEBHOOK_SUBSCRIPTION_CREATE_BY_TOPIC_MUTATION, {
        topic,
        callbackUrl,
      }),
    );
    // Doublon : soit une course concurrente inoffensive sur la MÊME URL, soit un abonnement
    // à une AUTRE URL (déploiement obsolète) → dans ce 2ᵉ cas les événements n'arrivent pas
    // ici. Ambigu depuis cette réponse seule : on avertit sans affirmer une panne.
    if (outcome === "duplicate") {
      console.warn(
        `Webhook ${topic} : abonnement déjà existant (course concurrente sur ${callbackUrl}, ` +
          `ou abonnement à une autre URL) — vérifier la livraison si les événements manquent.`,
      );
    }
  }
}
