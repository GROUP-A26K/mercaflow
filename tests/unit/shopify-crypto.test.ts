import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { decryptToken, encryptToken } from "@/lib/shopify/crypto";

const ORIGINAL_KEY = process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY;

beforeAll(() => {
  // Clé de test 32 octets (la clé réelle vient d'Infisical).
  process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

afterAll(() => {
  process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY = ORIGINAL_KEY;
});

describe("crypto tokens Shopify (AES-256-GCM)", () => {
  it("chiffre puis déchiffre (round-trip)", () => {
    const token = "shpat_offline_token_abcdef";
    expect(decryptToken(encryptToken(token))).toBe(token);
  });

  it("produit un ciphertext différent à chaque appel (IV aléatoire)", () => {
    expect(encryptToken("même-valeur")).not.toBe(encryptToken("même-valeur"));
  });

  it("rejette une charge altérée (auth tag GCM)", () => {
    const encrypted = encryptToken("secret");
    const tampered = `${encrypted.slice(0, -4)}AAAA`;
    expect(() => decryptToken(tampered)).toThrow();
  });

  it("rejette un format invalide", () => {
    expect(() => decryptToken("pas-un-format-valide")).toThrow();
  });
});
