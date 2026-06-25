import type { Metadata } from "next";

import { siteConfig } from "./config";

// Métadonnées par défaut appliquées à toute l'app via le root layout.
// `metadataBase` rend toutes les URLs relatives (canonical, OG) absolues automatiquement.
export const rootMetadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: siteConfig.name, template: `%s · ${siteConfig.name}` },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.ico", shortcut: "/favicon.ico" },
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    locale: siteConfig.locale,
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
    ...(siteConfig.twitter ? { creator: siteConfig.twitter } : {}),
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: { telephone: false, email: false, address: false },
};

type BuildMetadataOptions = {
  title?: string;
  description?: string;
  /** Chemin relatif de la page (pour le canonical + l'URL OG), ex. "/sign-in". */
  path?: string;
  /** Image OG dédiée à la page (sinon l'image OG globale s'applique). */
  image?: string;
  /** Exclut la page de l'indexation (pages d'auth, dashboard privé…). */
  noIndex?: boolean;
};

/**
 * Construit les métadonnées d'une page : title, description, canonical, OG et Twitter.
 * À exporter depuis chaque `page.tsx` : `export const metadata = buildMetadata({...})`.
 */
export function buildMetadata({
  title,
  description,
  path = "/",
  image,
  noIndex = false,
}: BuildMetadataOptions = {}): Metadata {
  const desc = description ?? siteConfig.description;

  return {
    title,
    description: desc,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: path,
      title: title ?? siteConfig.name,
      description: desc,
      siteName: siteConfig.name,
      locale: siteConfig.locale,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: title ?? siteConfig.name,
      description: desc,
      ...(image ? { images: [image] } : {}),
    },
    ...(noIndex ? { robots: { index: false, follow: false } } : {}),
  };
}
