import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IngestCatalogCard } from "@/app/(app)/dashboard/_components/ingest-catalog-card";

describe("IngestCatalogCard", () => {
  it("n'affiche rien sans connexion active", () => {
    const { container } = render(<IngestCatalogCard connections={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("affiche un déclencheur d'import par boutique active", () => {
    render(
      <IngestCatalogCard
        connections={[
          { id: "c1", shopDomain: "acme.myshopify.com" },
          { id: "c2", shopDomain: "beta.myshopify.com" },
        ]}
      />,
    );
    expect(screen.getByText("acme.myshopify.com")).toBeInTheDocument();
    expect(screen.getByText("beta.myshopify.com")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Importer le catalogue" }),
    ).toHaveLength(2);
  });
});
