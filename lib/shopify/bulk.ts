import "server-only";

// Bulk Operations Shopify (MER-26) : requête GraphQL bulk + parsing des réponses.
//
// Pourquoi le bulk : une requête classique sur tout le catalogue dépasse le coût de
// 1000 (`MAX_COST_EXCEEDED`). `bulkOperationRunQuery` exécute la requête en arrière-plan
// et produit un JSONL. Contraintes Shopify : ≥ 1 connexion, ≤ 5 connexions, profondeur
// d'imbrication ≤ 2. On reste sous la limite : products(racine) → variants → metafields,
// + products → metafields. `groupObjects: false` → chaque objet sur sa propre ligne,
// relié par `__parentId`.

/** Requête bulk du catalogue : produits, variants, et metafields des deux. */
export const BULK_CATALOG_QUERY = `{
  products {
    edges {
      node {
        id
        handle
        title
        descriptionHtml
        vendor
        productType
        status
        tags
        onlineStoreUrl
        updatedAt
        metafields {
          edges {
            node { id namespace key value type }
          }
        }
        variants {
          edges {
            node {
              id
              title
              sku
              barcode
              price
              compareAtPrice
              availableForSale
              inventoryQuantity
              position
              selectedOptions { name value }
              metafields {
                edges {
                  node { id namespace key value type }
                }
              }
            }
          }
        }
      }
    }
  }
}`;

/** Lance une bulk query (`groupObjects: false`, cf. MER-26). */
export const BULK_OPERATION_RUN_MUTATION = `mutation BulkCatalogRun($query: String!) {
  bulkOperationRunQuery(query: $query, groupObjects: false) {
    bulkOperation { id status }
    userErrors { field message }
  }
}`;

/** Récupère l'opération bulk de type QUERY courante (pré-check « 1 bulk query / shop »). */
export const CURRENT_BULK_OPERATION_QUERY = `query CurrentBulkOperation {
  currentBulkOperation(type: QUERY) {
    id
    status
    errorCode
    objectCount
    url
    createdAt
    completedAt
  }
}`;

/**
 * Récupère une opération bulk PRÉCISE par son id (statut + url autoritaires). À utiliser
 * côté webhook finish plutôt que `currentBulkOperation` : cette dernière renvoie l'op
 * « courante » du shop, qui peut déjà être une nouvelle op ou être en retard de cohérence.
 */
export const BULK_OPERATION_BY_ID_QUERY = `query BulkOperationById($id: ID!) {
  node(id: $id) {
    ... on BulkOperation {
      id
      status
      errorCode
      objectCount
      url
    }
  }
}`;

/** Crée l'abonnement webhook `bulk_operations/finish` (HTTPS, payload JSON). */
export const WEBHOOK_SUBSCRIPTION_CREATE_MUTATION = `mutation CreateBulkFinishWebhook($callbackUrl: URL!) {
  webhookSubscriptionCreate(
    topic: BULK_OPERATIONS_FINISH
    webhookSubscription: { callbackUrl: $callbackUrl, format: JSON }
  ) {
    webhookSubscription { id }
    userErrors { field message }
  }
}`;

/** Liste les abonnements `bulk_operations/finish` existants (idempotence). */
// first: 250 (max d'une connexion GraphQL) → couvre largement le seul abonnement que
// notre app crée pour ce topic ; évite qu'une page trop courte rate notre callback et
// fasse accumuler des doublons.
export const BULK_FINISH_WEBHOOKS_QUERY = `query BulkFinishWebhooks {
  webhookSubscriptions(first: 250, topics: [BULK_OPERATIONS_FINISH]) {
    edges {
      node {
        id
        endpoint {
          __typename
          ... on WebhookHttpEndpoint { callbackUrl }
        }
      }
    }
  }
}`;

export type BulkOperationStatus =
  | "CREATED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELING"
  | "CANCELED"
  | "EXPIRED";

export interface BulkOperationRef {
  id: string;
  status: BulkOperationStatus;
}

export interface CurrentBulkOperation extends BulkOperationRef {
  errorCode: string | null;
  url: string | null;
  objectCount: string | null;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

interface UserError {
  field?: string[] | null;
  message: string;
}

/** Lève si la réponse GraphQL porte des erreurs de haut niveau (throttling, syntaxe…). */
function assertNoGraphQLErrors(response: GraphQLResponse<unknown>): void {
  if (response.errors && response.errors.length > 0) {
    const messages = response.errors.map((error) => error.message).join("; ");
    throw new Error(`Erreur GraphQL Shopify : ${messages}`);
  }
}

function assertNoUserErrors(userErrors: UserError[] | undefined): void {
  if (userErrors && userErrors.length > 0) {
    const messages = userErrors.map((error) => error.message).join("; ");
    throw new Error(`Bulk Operation rejetée : ${messages}`);
  }
}

/** Parse la réponse de `bulkOperationRunQuery` → l'opération créée. */
export function parseBulkOperationRunResult(
  payload: unknown,
): BulkOperationRef {
  const response = payload as GraphQLResponse<{
    bulkOperationRunQuery: {
      bulkOperation: BulkOperationRef | null;
      userErrors: UserError[];
    };
  }>;
  assertNoGraphQLErrors(response);
  const result = response.data?.bulkOperationRunQuery;
  assertNoUserErrors(result?.userErrors);
  if (!result?.bulkOperation) {
    throw new Error("Bulk Operation : réponse sans bulkOperation");
  }
  return result.bulkOperation;
}

/** Parse la réponse de `currentBulkOperation` (null s'il n'y en a pas). */
export function parseCurrentBulkOperation(
  payload: unknown,
): CurrentBulkOperation | null {
  const response = payload as GraphQLResponse<{
    currentBulkOperation: CurrentBulkOperation | null;
  }>;
  assertNoGraphQLErrors(response);
  return response.data?.currentBulkOperation ?? null;
}

/** Parse la réponse de `node(id:)` ciblant une BulkOperation (null si introuvable). */
export function parseBulkOperationNode(
  payload: unknown,
): CurrentBulkOperation | null {
  const response = payload as GraphQLResponse<{
    node: CurrentBulkOperation | null;
  }>;
  assertNoGraphQLErrors(response);
  return response.data?.node ?? null;
}

/** Vrai tant que l'opération n'est pas terminée (contrainte « 1 bulk query / shop »). */
export function isBulkOperationRunning(status: string): boolean {
  // CANCELING = annulation en cours mais opération encore non terminée → lancer une
  // nouvelle bulk query serait rejeté par Shopify : on la traite comme « en cours ».
  return status === "CREATED" || status === "RUNNING" || status === "CANCELING";
}

/** Retrouve l'id d'un abonnement `bulk_operations/finish` pointant vers `callbackUrl`. */
export function parseExistingBulkFinishWebhook(
  payload: unknown,
  callbackUrl: string,
): string | null {
  const response = payload as GraphQLResponse<{
    webhookSubscriptions: {
      edges: {
        node: {
          id: string;
          endpoint: { __typename: string; callbackUrl?: string };
        };
      }[];
    };
  }>;
  assertNoGraphQLErrors(response);
  const edges = response.data?.webhookSubscriptions.edges ?? [];
  const match = edges.find(
    (edge) => edge.node.endpoint.callbackUrl === callbackUrl,
  );
  return match?.node.id ?? null;
}
