import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";

import { sendEmail } from "@/lib/mail/send";
import { welcomeEmail } from "@/lib/mail/templates";

// Webhook Clerk → déclenche l'email de bienvenue à la création d'un compte.
// `verifyWebhook` vérifie la signature svix via CLERK_WEBHOOK_SIGNING_SECRET.
// Route publique (clerkMiddleware ne protège rien par défaut) ; appelée par les serveurs Clerk.
export async function POST(req: NextRequest) {
  let evt;
  try {
    evt = await verifyWebhook(req);
  } catch (err) {
    console.error("Webhook Clerk : signature invalide", err);
    return new Response("Signature invalide", { status: 400 });
  }

  if (evt.type === "user.created") {
    const { email_addresses, primary_email_address_id, first_name } = evt.data;
    const email = email_addresses.find(
      (e) => e.id === primary_email_address_id,
    )?.email_address;

    if (email) {
      try {
        await sendEmail({
          to: email,
          ...welcomeEmail({ name: first_name ?? undefined }),
        });
      } catch (err) {
        // On répond 200 malgré l'échec : éviter que Clerk retente le webhook en boucle
        // pour un simple email. L'erreur est loggée pour diagnostic.
        console.error("Email de bienvenue : envoi échoué", err);
      }
    }
  }

  return new Response("ok", { status: 200 });
}
