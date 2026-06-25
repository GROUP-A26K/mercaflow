// Rend un bloc de données structurées schema.org. Server Component (aucun JS client envoyé).
// Usage : <JsonLd data={organizationJsonLd()} />
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // Le contenu provient de nos propres constructeurs typés (lib/seo/json-ld), pas d'input utilisateur.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
