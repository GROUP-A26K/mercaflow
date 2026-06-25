import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/seo/config";

// Génère /robots.txt. Bloque les zones privées/auth, pointe vers le sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard/", "/sign-in/", "/sign-up/", "/api/"],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
