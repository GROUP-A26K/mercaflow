import { siteConfig } from "@/lib/seo/config";

// Gabarits d'emails (pur HTML, sans dépendance). Pas de `server-only` ici : fonctions
// pures, réutilisables et testables. L'envoi se fait via `sendEmail` (lib/mail/send.ts).
// Si les emails deviennent riches, envisager `@react-email/components` (rendu React).

export type EmailContent = { subject: string; html: string; text: string };

export function welcomeEmail({ name }: { name?: string } = {}): EmailContent {
  const greeting = name ? `Bonjour ${name},` : "Bonjour,";
  return {
    subject: `Bienvenue sur ${siteConfig.name}`,
    text: `${greeting}\n\nBienvenue sur ${siteConfig.name}.`,
    html: `<div style="font-family:system-ui,sans-serif;line-height:1.6;color:#0a0a0a">
  <p>${greeting}</p>
  <p>Bienvenue sur <strong>${siteConfig.name}</strong>.</p>
  <p style="color:#71717a;font-size:13px">${siteConfig.description}</p>
</div>`,
  };
}
