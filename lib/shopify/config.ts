import "server-only";

// Configuration de l'App Shopify (MER-24). Valeurs réelles via Infisical `/shopify`.

// Scopes V1 — read-only (D7). Les metafields produits sont couverts par `read_products`.
export const SHOPIFY_SCOPES = [
  "read_products",
  "read_inventory",
  "read_publications",
  "read_product_listings",
  "read_metaobjects",
] as const;

export const SHOPIFY_REDIRECT_PATH = "/api/shopify/callback";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement ${name} manquante`);
  return value;
}

export interface ShopifyConfig {
  clientId: string;
  clientSecret: string;
  apiVersion: string;
  scopes: string;
}

export function shopifyConfig(): ShopifyConfig {
  return {
    clientId: required("SHOPIFY_API_CLIENT_ID"),
    clientSecret: required("SHOPIFY_API_SECRET"),
    apiVersion: process.env.SHOPIFY_API_VERSION ?? "2026-04",
    scopes: SHOPIFY_SCOPES.join(","),
  };
}
