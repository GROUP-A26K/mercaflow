import { siteConfig } from "@/lib/seo/config";

// Gabarits d'emails (pur HTML, sans dépendance). Pas de `server-only` ici : fonctions
// pures, réutilisables et testables. L'envoi se fait via `sendEmail` (lib/mail/send.ts).
// Si les emails deviennent riches, envisager `@react-email/components` (rendu React).

export type EmailContent = { subject: string; html: string; text: string };

// Échappe le HTML pour éviter toute injection depuis les champs du formulaire.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function contactEmail({
  name,
  email,
  company,
  message,
}: {
  name: string;
  email: string;
  company?: string;
  message: string;
}): EmailContent {
  const companyText = company ? `Company: ${company}\n` : "";
  return {
    subject: `New contact request from ${name}`,
    text: `New contact request\n\nName: ${name}\nEmail: ${email}\n${companyText}\nMessage:\n${message}`,
    html: `<div style="font-family:system-ui,sans-serif;line-height:1.6;color:#0a0a0a">
  <h2 style="margin:0 0 12px">New contact request</h2>
  <p style="margin:0"><strong>Name:</strong> ${escapeHtml(name)}</p>
  <p style="margin:0"><strong>Email:</strong> ${escapeHtml(email)}</p>
  ${company ? `<p style="margin:0"><strong>Company:</strong> ${escapeHtml(company)}</p>` : ""}
  <p style="margin:12px 0 4px"><strong>Message</strong></p>
  <p style="margin:0;white-space:pre-wrap">${escapeHtml(message)}</p>
</div>`,
  };
}

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
