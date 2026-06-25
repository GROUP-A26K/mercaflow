import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/seo/config";

// Génère /sitemap.xml. N'inclure QUE les routes publiques indexables
// (pas /dashboard, /sign-in, /sign-up). Étendre cette liste à chaque page publique.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteConfig.url;

  return [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
