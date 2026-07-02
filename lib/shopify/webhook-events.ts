import "server-only";

import { contentHash, type RawRecordInsert } from "@/lib/shopify/raw-record";

// Traitement des webhooks incrémentaux Shopify (MER-27).
// Contrairement à l'ingestion bulk (payload = nœud GraphQL avec GID en `id`), les webhooks
// REST portent un payload JSON « produit » / « inventory level » où le GID vit dans
// `admin_graphql_api_id`. On mappe chaque topic vers une action : ingérer (append-only dans
// raw_records), révoquer la connexion (désinstallation), ou ignorer (topic non géré → on
// acquitte quand même, pour éviter les retries Shopify sur des événements qu'on n'écoute pas).

export type WebhookAction =
  | { kind: "ingest"; resourceType: string }
  | { kind: "revoke" }
  | { kind: "ignore" };

type WebhookPayload = Record<string, unknown>;

/**
 * Payload de webhook dont on ne peut extraire aucun identifiant exploitable. Distincte des
 * erreurs inattendues : le routeur l'acquitte (200) sans demander de retry (il échouerait à
 * l'identique), là où toute AUTRE erreur doit remonter (500 → Shopify retente, échec visible).
 */
export class UnmappableWebhookPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnmappableWebhookPayloadError";
  }
}

interface IngestTopic {
  resourceType: string;
  externalId: (payload: WebhookPayload) => string;
}

/** GID d'un produit : `admin_graphql_api_id` si présent, sinon composé depuis l'id REST. */
function productGid(payload: WebhookPayload): string {
  const gid = payload.admin_graphql_api_id;
  if (typeof gid === "string" && gid.length > 0) return gid;
  const id = payload.id;
  if (typeof id === "number" || typeof id === "string") {
    return `gid://shopify/Product/${id}`;
  }
  throw new UnmappableWebhookPayloadError(
    "Webhook produit sans identifiant (id / admin_graphql_api_id)",
  );
}

/**
 * Clé stable d'un niveau d'inventaire. On privilégie `admin_graphql_api_id` ; à défaut on
 * compose le GID `InventoryLevel` canonique de Shopify — `location_id` dans le chemin,
 * `inventory_item_id` en query — pour que le fallback COÏNCIDE avec le GID réel et ne crée
 * pas un second external_id qui contournerait la dédup / les jointures de normalisation.
 */
function inventoryLevelKey(payload: WebhookPayload): string {
  const gid = payload.admin_graphql_api_id;
  if (typeof gid === "string" && gid.length > 0) return gid;
  const item = payload.inventory_item_id;
  const location = payload.location_id;
  const scalar = (v: unknown): v is number | string =>
    typeof v === "number" || typeof v === "string";
  if (scalar(item) && scalar(location)) {
    return `gid://shopify/InventoryLevel/${location}?inventory_item_id=${item}`;
  }
  throw new UnmappableWebhookPayloadError(
    "Webhook inventory_levels/update sans clé (inventory_item_id / location_id)",
  );
}

// Topics dont on ingère le payload dans raw_records (append-only). `products/delete` est
// ingéré comme les autres : la couche de normalisation (MER-28) interprétera l'état courant
// à partir des observations successives (le raw reste un journal, pas un état).
const INGEST_TOPICS: Record<string, IngestTopic> = {
  "products/create": { resourceType: "product", externalId: productGid },
  "products/update": { resourceType: "product", externalId: productGid },
  "products/delete": { resourceType: "product", externalId: productGid },
  "inventory_levels/update": {
    resourceType: "inventory_level",
    externalId: inventoryLevelKey,
  },
};

const REVOKE_TOPIC = "app/uninstalled";

/**
 * Classe un topic Shopify (`X-Shopify-Topic`) en action. Un topic inconnu ou absent est
 * `ignore` : on acquitte (200) sans traiter, plutôt que de renvoyer une erreur qui
 * déclencherait des retries Shopify inutiles.
 */
export function classifyWebhookTopic(
  topic: string | null | undefined,
): WebhookAction {
  if (!topic) return { kind: "ignore" };
  if (topic === REVOKE_TOPIC) return { kind: "revoke" };
  const ingest = INGEST_TOPICS[topic];
  if (ingest) return { kind: "ingest", resourceType: ingest.resourceType };
  return { kind: "ignore" };
}

export interface WebhookRawRecordParams {
  orgId: string;
  connectionId: string;
  topic: string;
  payload: WebhookPayload;
}

/**
 * Construit une ligne `raw_records` (append-only) depuis un webhook incrémental.
 * `external_id` = GID Shopify, `content_hash` = hash stable du payload (un payload identique
 * réémis → no-op via la contrainte unique de la table). Lève si le topic n'est pas un topic
 * d'ingestion — le routeur doit l'avoir classé avec `classifyWebhookTopic` au préalable.
 */
export function toRawRecordFromWebhook(
  params: WebhookRawRecordParams,
): RawRecordInsert {
  const topic = INGEST_TOPICS[params.topic];
  if (!topic) {
    throw new Error(`Topic webhook non ingérable : ${params.topic}`);
  }
  return {
    org_id: params.orgId,
    connection_id: params.connectionId,
    resource_type: topic.resourceType,
    external_id: topic.externalId(params.payload),
    payload: params.payload,
    content_hash: contentHash(params.payload),
  };
}
