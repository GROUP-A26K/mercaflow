import { ImageResponse } from "next/og";

import { siteConfig } from "./config";

// Rendu partagé des images OG/Twitter (générées dynamiquement, sans asset lourd à charger).
// Dimension standard recommandée par les réseaux sociaux : 1200×630.
export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

export function renderOgImage(title: string = siteConfig.name) {
  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "flex-end",
        background: "#0a0a0a",
        padding: 80,
      }}
    >
      <div style={{ fontSize: 84, fontWeight: 700, color: "#fafafa" }}>
        {title}
      </div>
      <div style={{ fontSize: 32, color: "#a1a1aa", marginTop: 20 }}>
        {siteConfig.description}
      </div>
    </div>,
    { ...ogSize },
  );
}
