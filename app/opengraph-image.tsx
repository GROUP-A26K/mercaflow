import { siteConfig } from "@/lib/seo/config";
import { ogContentType, ogSize, renderOgImage } from "@/lib/seo/og-image";

// Image Open Graph globale → /opengraph-image. Next la référence automatiquement
// dans les métadonnées OG de toutes les pages (sauf override par page).
export const alt = siteConfig.name;
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return renderOgImage();
}
