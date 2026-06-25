// Source de vérité unique pour le SEO. Utilisée par metadataBase, sitemap, robots,
// manifest, images OG et JSON-LD. Modifier ICI pour propager partout.

export const siteConfig = {
  name: "Mercaflow",
  // URL absolue de prod. À définir via NEXT_PUBLIC_SITE_URL (sinon fallback localhost).
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  // ⚠️ TODO : remplacer par la vraie description (≤ ~155 caractères, mots-clés en tête).
  description:
    "Mercaflow — décrivez ici votre produit en une phrase claire et riche en mots-clés.",
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
