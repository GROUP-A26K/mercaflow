"use server";

import { getCurrentUser } from "@/lib/data/auth";
import { sendEmail } from "@/lib/mail/send";
import { welcomeEmail } from "@/lib/mail/templates";

export type TestEmailState = { ok: boolean; message: string } | null;

// Envoie un email de test à l'utilisateur connecté → valide le setup Resend de bout en bout.
export async function sendTestEmail(): Promise<TestEmailState> {
  const user = await getCurrentUser();
  if (!user?.email) {
    return { ok: false, message: "Aucune adresse email sur le compte." };
  }

  try {
    await sendEmail({ to: user.email, ...welcomeEmail() });
    return { ok: true, message: `Email envoyé à ${user.email}.` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Échec de l'envoi.",
    };
  }
}
