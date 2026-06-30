import "server-only";

import { isValidShopDomain } from "@/lib/shopify/oauth";

// Client GraphQL Admin Shopify (MER-26). Endpoint pinné à la version d'API configurée
// (2026-04 par défaut, cf. shopifyConfig). Authentifié par le token offline déchiffré
// de la `shopify_connections`. ⚠️ Server-only : le token ne doit jamais fuiter au client.

export interface AdminClientParams {
  shop: string;
  accessToken: string;
  apiVersion: string;
}

export interface AdminGraphQLClient {
  shop: string;
  query<T = unknown>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T>;
}

/** Construit un client GraphQL Admin pour une boutique donnée. */
export function createAdminGraphQLClient(
  params: AdminClientParams,
): AdminGraphQLClient {
  // Valider le domaine avant de l'interpoler dans l'hôte : empêche tout appelant futur
  // d'envoyer le token Shopify vers un domaine arbitraire (injection d'hôte).
  if (!isValidShopDomain(params.shop)) {
    throw new Error(`Domaine de boutique Shopify invalide : ${params.shop}`);
  }
  const endpoint = `https://${params.shop}/admin/api/${params.apiVersion}/graphql.json`;

  return {
    shop: params.shop,
    async query<T = unknown>(
      query: string,
      variables?: Record<string, unknown>,
    ): Promise<T> {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": params.accessToken,
        },
        body: JSON.stringify({ query, variables }),
      });
      if (!response.ok) {
        throw new Error(
          `Requête GraphQL Admin Shopify échouée (HTTP ${response.status})`,
        );
      }
      return (await response.json()) as T;
    },
  };
}

/**
 * Télécharge une URL et la restitue en flux de chunks texte (UTF-8), sans tout charger
 * en mémoire. Utilisé pour streamer le JSONL d'une Bulk Operation (plusieurs centaines
 * de Mo possibles). L'URL expire 7 jours après la fin de l'opération.
 */
export async function* streamTextFromUrl(url: string): AsyncIterable<string> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Téléchargement du JSONL échoué (HTTP ${response.status})`);
  }
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let done = false;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (chunk.value) yield decoder.decode(chunk.value, { stream: true });
    }
    const tail = decoder.decode();
    if (tail) yield tail;
    done = true;
  } finally {
    // Si le consommateur s'arrête tôt (break/throw), `cancel()` interrompt le téléchargement
    // restant ; en lecture complète, `releaseLock()` suffit.
    if (done) {
      reader.releaseLock();
    } else {
      await reader.cancel().catch(() => {});
    }
  }
}
