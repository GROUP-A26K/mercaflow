import "server-only";

import { Resend } from "resend";

// Client Resend (email transactionnel). `server-only` : la clé API ne doit jamais
// atterrir dans un bundle client. Init paresseuse pour ne pas planter à l'import
// quand la clé est absente (build, tests, environnements sans email).
let client: Resend | null = null;

export function getResend(): Resend {
  if (!client) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error(
        "RESEND_API_KEY manquante — renseignez-la dans .env.local (voir .env.example).",
      );
    }
    client = new Resend(apiKey);
  }
  return client;
}

// Expéditeur par défaut. DOIT être un domaine vérifié dans Resend (sinon l'envoi échoue).
export const MAIL_FROM =
  process.env.RESEND_FROM_EMAIL ?? "Mercaflow <onboarding@resend.dev>";
