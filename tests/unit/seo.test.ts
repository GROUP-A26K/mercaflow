import { describe, expect, it } from "vitest";

import { organizationJsonLd, webPageJsonLd } from "@/lib/seo/json-ld";
import { buildMetadata } from "@/lib/seo/metadata";

describe("buildMetadata", () => {
  it("définit le canonical sur le chemin fourni", () => {
    const meta = buildMetadata({ path: "/sign-in" });
    expect(meta.alternates?.canonical).toBe("/sign-in");
  });

  it("désactive l'indexation quand noIndex est vrai", () => {
    const meta = buildMetadata({ noIndex: true });
    expect(meta.robots).toMatchObject({ index: false, follow: false });
  });

  it("renseigne les balises Open Graph", () => {
    const meta = buildMetadata({ title: "Accueil", path: "/" });
    expect(meta.openGraph).toMatchObject({ title: "Accueil", url: "/" });
  });
});

describe("données structurées schema.org", () => {
  it("produit une Organization valide", () => {
    const data = organizationJsonLd();
    expect(data["@context"]).toBe("https://schema.org");
    expect(data["@type"]).toBe("Organization");
  });

  it("produit une WebPage", () => {
    const data = webPageJsonLd({ name: "Accueil", path: "/" });
    expect(data["@type"]).toBe("WebPage");
    expect(data.name).toBe("Accueil");
  });
});
