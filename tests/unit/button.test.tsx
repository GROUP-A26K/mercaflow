import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("affiche son contenu", () => {
    render(<Button>Valider</Button>);
    expect(
      screen.getByRole("button", { name: "Valider" }),
    ).toBeInTheDocument();
  });

  it("expose le variant via l'attribut data-variant", () => {
    render(<Button variant="outline">X</Button>);
    expect(screen.getByRole("button")).toHaveAttribute(
      "data-variant",
      "outline",
    );
  });
});
