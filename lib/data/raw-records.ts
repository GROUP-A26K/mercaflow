import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { RawRecordInsert } from "@/lib/shopify/raw-record";

// DATA ACCESS LAYER — ingestion brute (couche 1, MER-26).
// Écriture via le client SERVICE-ROLE : l'ingestion est déclenchée par un webhook Shopify
// (pas de session Clerk). L'`org_id` est porté par chaque ligne (issu de la connexion).
//
// Déduplication : la table a une contrainte unique (connection_id, external_id, content_hash).
// On insère en `ignoreDuplicates` → un payload déjà vu est un no-op (append-only, idempotent).

/** Taille de lot pour l'insertion (borne la taille des requêtes sur gros catalogues). */
export const RAW_RECORDS_BATCH_SIZE = 500;

/** Insère un lot de `raw_records` (déduplication via la contrainte unique). */
export async function insertRawRecords(
  records: readonly RawRecordInsert[],
): Promise<void> {
  if (records.length === 0) return;
  const supabase = createAdminClient();
  const { error } = await supabase.from("raw_records").upsert(records, {
    onConflict: "connection_id,external_id,content_hash",
    ignoreDuplicates: true,
  });
  if (error) {
    throw new Error(`Insertion raw_records échouée : ${error.message}`);
  }
}
