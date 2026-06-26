import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  PricingTiers,
  tiers,
} from "@/app/(marketing)/pricing/_components/pricing-tiers";

describe("PricingTiers", () => {
  it("expose exactement 3 offres", () => {
    expect(tiers).toHaveLength(3);
  });

  it("affiche le nom de chaque offre", () => {
    render(<PricingTiers />);
    for (const tier of tiers) {
      expect(
        screen.getByRole("heading", { name: tier.name }),
      ).toBeInTheDocument();
    }
  });

  it("met une seule offre en avant avec le liseré shimmer", () => {
    const { container } = render(<PricingTiers />);
    const featured = container.querySelectorAll(".fx-shimmer");
    expect(featured).toHaveLength(1);
    expect(featured[0]).toHaveClass("fx-border");
    expect(tiers.filter((t) => t.featured)).toHaveLength(1);
  });

  it("rend un lien CTA par offre", () => {
    render(<PricingTiers />);
    for (const tier of tiers) {
      expect(
        screen.getByRole("link", { name: tier.cta.label }),
      ).toHaveAttribute("href", tier.cta.href);
    }
  });
});
