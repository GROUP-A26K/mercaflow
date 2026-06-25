import "server-only";

import { getResend, MAIL_FROM } from "./client";

type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string | string[];
};

/**
 * Envoie un email transactionnel via Resend. À appeler depuis du code serveur
 * (Server Actions, Route Handlers, jobs). Lève une erreur explicite en cas d'échec.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  from = MAIL_FROM,
  replyTo,
}: SendEmailInput) {
  const { data, error } = await getResend().emails.send({
    from,
    to,
    subject,
    html,
    ...(text ? { text } : {}),
    ...(replyTo ? { replyTo } : {}),
  });

  if (error) {
    throw new Error(`Échec de l'envoi de l'email : ${error.message}`);
  }
  return data;
}
