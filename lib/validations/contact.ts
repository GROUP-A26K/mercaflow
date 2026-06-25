// Validation d'entrée du formulaire de contact (pure, sans dépendance → testable et
// réutilisable côté serveur ET client). Même approche que validations/notes.ts.

export const CONTACT_MESSAGE_MAX = 2000;

export type ContactValue = {
  name: string;
  email: string;
  company: string;
  message: string;
};

export type ContactFieldErrors = Partial<
  Record<"name" | "email" | "message", string>
>;

export type ContactValidation =
  | { ok: true; value: ContactValue }
  | { ok: false; fieldErrors: ContactFieldErrors };

// Validation d'email volontairement simple (un regex strict rejette des adresses valides).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const asString = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function validateContact(input: {
  name: unknown;
  email: unknown;
  company: unknown;
  message: unknown;
}): ContactValidation {
  const name = asString(input.name);
  const email = asString(input.email);
  const company = asString(input.company);
  const message = asString(input.message);

  const fieldErrors: ContactFieldErrors = {};

  if (!name) fieldErrors.name = "Please enter your name.";

  if (!email) fieldErrors.email = "Please enter your email.";
  else if (!EMAIL_RE.test(email))
    fieldErrors.email = "Please enter a valid email address.";

  if (!message) fieldErrors.message = "Please enter a message.";
  else if (message.length > CONTACT_MESSAGE_MAX)
    fieldErrors.message = `Maximum ${CONTACT_MESSAGE_MAX} characters.`;

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, value: { name, email, company, message } };
}
