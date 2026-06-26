import { siteConfig } from "./config";

// Constructeurs de données structurées schema.org (rich snippets Google).
// Le rendu se fait via <JsonLd data={...} /> (components/seo/json-ld.tsx).

/** Organisation — à rendre une fois, globalement (root layout). */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.name,
    url: siteConfig.url,
    logo: `${siteConfig.url}/favicon.ico`,
    sameAs: Object.values(siteConfig.links),
  };
}

/** Site web (+ SearchAction optionnelle) — à rendre une fois, globalement. */
export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    url: siteConfig.url,
    inLanguage: siteConfig.locale.replace("_", "-"),
  };
}

/** Page générique — à rendre par page pour enrichir le snippet. */
export function webPageJsonLd(opts: {
  name: string;
  description?: string;
  path?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: opts.name,
    description: opts.description ?? siteConfig.description,
    url: `${siteConfig.url}${opts.path ?? "/"}`,
    isPartOf: {
      "@type": "WebSite",
      name: siteConfig.name,
      url: siteConfig.url,
    },
  };
}

/** Fil d'Ariane — améliore l'affichage du chemin dans les résultats Google. */
export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${siteConfig.url}${item.path}`,
    })),
  };
}
