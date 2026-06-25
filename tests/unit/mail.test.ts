import { describe, expect, it } from "vitest";

import { welcomeEmail } from "@/lib/mail/templates";

describe("welcomeEmail", () => {
  it("inclut le nom du destinataire quand il est fourni", () => {
    const mail = welcomeEmail({ name: "JB" });
    expect(mail.subject).toContain("Mercaflow");
    expect(mail.html).toContain("JB");
  });

  it("reste valide sans nom", () => {
    const mail = welcomeEmail();
    expect(mail.html).toContain("Bonjour,");
    expect(mail.text).toContain("Mercaflow");
  });
});
