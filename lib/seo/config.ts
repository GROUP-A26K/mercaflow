// Source de vérité unique pour le SEO. Utilisée par metadataBase, sitemap, robots,
// manifest, images OG et JSON-LD. Modifier ICI pour propager partout.

export const siteConfig = {
  name: "Mercaflow",
  // URL absolue de prod. À définir via NEXT_PUBLIC_SITE_URL (sinon fallback localhost).
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  // Description SEO (≤ ~155 caractères, mots-clés en tête).
  description:
    "Mercaflow révèle quels produits sont recommandés ou invisibles dans ChatGPT, Perplexity et Gemini, et génère les corrections SKU pour les rendre visibles.",
  locale: "fr_FR",
  // Handle Twitter/X pour les cartes (avec @). Laisser vide si aucun.
  twitter: "",
  // Liens sociaux officiels → injectés dans `sameAs` du JSON-LD Organization.
  links: {
    // twitter: "https://x.com/mercaflow",
    // linkedin: "https://www.linkedin.com/company/mercaflow",
  },
} as const;

export type SiteConfig = typeof siteConfig;
