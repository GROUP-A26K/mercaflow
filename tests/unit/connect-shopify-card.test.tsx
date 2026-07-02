import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConnectShopifyCard } from "@/app/(app)/dashboard/_components/connect-shopify-card";

describe("ConnectShopifyCard", () => {
  it("soumet en GET vers la route d'install OAuth", () => {
    const { container } = render(<ConnectShopifyCard />);
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    // GET same-origin → satisfait le garde Sec-Fetch-Site de la route.
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/api/shopify/install");
  });

  it("expose un champ `shop` requis (le param attendu par la route)", () => {
    render(<ConnectShopifyCard />);
    const input = screen.getByLabelText("Domaine de la boutique");
    expect(input).toHaveAttribute("name", "shop");
    expect(input).toBeRequired();
  });

  it("propose un bouton de soumission", () => {
    render(<ConnectShopifyCard />);
    expect(
      screen.getByRole("button", { name: "Connecter" }),
    ).toBeInTheDocument();
  });
});
