import { describe, expect, it } from "vitest";

import {
  validateContact,
  CONTACT_MESSAGE_MAX,
} from "@/lib/validations/contact";

const valid = {
  name: "Jane Doe",
  email: "jane@brand.com",
  company: "Brand",
  message: "Hello, I'd like an audit.",
};

describe("validateContact", () => {
  it("accepte une entrée valide et trim les valeurs", () => {
    const result = validateContact({ ...valid, name: "  Jane Doe  " });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe("Jane Doe");
  });

  it("autorise une entreprise vide (champ optionnel)", () => {
    const result = validateContact({ ...valid, company: "" });
    expect(result.ok).toBe(true);
  });

  it("exige le nom, l'email et le message", () => {
    const result = validateContact({
      name: "",
      email: "",
      company: "",
      message: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.name).toBeDefined();
      expect(result.fieldErrors.email).toBeDefined();
      expect(result.fieldErrors.message).toBeDefined();
    }
  });

  it("rejette un email invalide", () => {
    const result = validateContact({ ...valid, email: "not-an-email" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.email).toBeDefined();
  });

  it("rejette un message trop long", () => {
    const result = validateContact({
      ...valid,
      message: "x".repeat(CONTACT_MESSAGE_MAX + 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.message).toBeDefined();
  });
});
