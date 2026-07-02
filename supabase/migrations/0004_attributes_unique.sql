-- Normalisation Shopify (MER-28) : clé d'unicité pour un upsert idempotent des attributs.
-- La table `attributes` (migration 0002) n'avait qu'un index non-unique. La normalisation
-- ré-exécutée (nouveau snapshot bulk, ou webhook incrémental) doit pouvoir upserter sans
-- créer de doublons → contrainte unique sur (owner_type, owner_id, namespace, key).
-- `value` / `value_type` sont mis à jour en place sur conflit (cf. DAL lib/data/catalog.ts).

-- Dédoublonnage préalable (idempotence de la migration) : on ne supprime QUE les doublons
-- EXACTS (même value ET value_type) en gardant le plus petit `id`. Des doublons en conflit
-- (même clé mais value/value_type différents) NE sont PAS supprimés → l'ajout de contrainte
-- ci-dessous échoue alors volontairement (fail-fast) plutôt que de perdre une donnée en
-- choisissant arbitrairement une version (l'`id` uuid n'est pas un signal de fraîcheur).
delete from public.attributes a
  using public.attributes b
  where a.id > b.id
    and a.owner_type = b.owner_type
    and a.owner_id = b.owner_id
    and a.namespace = b.namespace
    and a.key = b.key
    and a.value is not distinct from b.value
    and a.value_type is not distinct from b.value_type;

alter table public.attributes
  add constraint attributes_owner_namespace_key_unique
  unique (owner_type, owner_id, namespace, key);
