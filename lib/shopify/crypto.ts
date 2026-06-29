import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Chiffrement au repos des tokens offline Shopify (AES-256-GCM, authentifié).
// Clé : `SHOPIFY_TOKEN_ENCRYPTION_KEY` = 32 octets encodés en base64.
// Format de sortie : `iv.tag.ciphertext` (chaque segment en base64).

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function encryptionKey(): Buffer {
  const raw = process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("Variable SHOPIFY_TOKEN_ENCRYPTION_KEY manquante");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "SHOPIFY_TOKEN_ENCRYPTION_KEY doit faire 32 octets (base64)",
    );
  }
  return key;
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64")).join(".");
}

export function decryptToken(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Charge chiffrée malformée");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    encryptionKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
