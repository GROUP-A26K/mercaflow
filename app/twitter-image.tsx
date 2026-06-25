import { siteConfig } from "@/lib/seo/config";
import { ogContentType, ogSize, renderOgImage } from "@/lib/seo/og-image";

// Image Twitter/X globale → /twitter-image (réutilise le rendu OG).
export const alt = siteConfig.name;
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return renderOgImage();
}
