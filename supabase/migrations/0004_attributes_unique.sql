-- Normalisation Shopify (MER-28) : clé d'unicité pour un upsert idempotent des attributs.
-- La table `attributes` (migration 0002) n'avait qu'un index non-unique. La normalisation
-- ré-exécutée (nouveau snapshot bulk, ou webhook incrémental) doit pouvoir upserter sans
-- créer de doublons → contrainte unique sur (owner_type, owner_id, namespace, key).
-- `value` / `value_type` sont mis à jour en place sur conflit (cf. DAL lib/data/catalog.ts).

-- Dédoublonnage préalable (idempotence de la migration) : si des tuples dupliqués existent
-- déjà, on ne garde que la ligne au plus petit `id` par (owner_type, owner_id, namespace, key)
-- — sinon l'ajout de la contrainte échouerait et bloquerait le déploiement.
delete from public.attributes a
  using public.attributes b
  where a.id > b.id
    and a.owner_type = b.owner_type
    and a.owner_id = b.owner_id
    and a.namespace = b.namespace
    and a.key = b.key;

alter table public.attributes
  add constraint attributes_owner_namespace_key_unique
  unique (owner_type, owner_id, namespace, key);
