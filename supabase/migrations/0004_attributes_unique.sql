-- Normalisation Shopify (MER-28) : clé d'unicité pour un upsert idempotent des attributs.
-- La table `attributes` (migration 0002) n'avait qu'un index non-unique. La normalisation
-- ré-exécutée (nouveau snapshot bulk, ou webhook incrémental) doit pouvoir upserter sans
-- créer de doublons → contrainte unique sur (owner_type, owner_id, namespace, key).
-- `value` / `value_type` sont mis à jour en place sur conflit (cf. DAL lib/data/catalog.ts).

alter table public.attributes
  add constraint attributes_owner_namespace_key_unique
  unique (owner_type, owner_id, namespace, key);
