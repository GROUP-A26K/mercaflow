"use server";

import { sendEmail } from "@/lib/mail/send";
import { contactEmail } from "@/lib/mail/templates";
import {
  validateContact,
  type ContactFieldErrors,
} from "@/lib/validations/contact";

// Destinataire des demandes de contact. ⚠️ Adresse fournie par l'utilisateur
// (benjamin@a256k.ch) — distincte de l'email projet en mémoire (a26k.ch).
const CONTACT_RECIPIENT = "benjamin@a256k.ch";

export type ContactFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: ContactFieldErrors;
};

// Server Action (pattern useActionState : (prevState, formData)).
export async function submitContactAction(
  _prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const result = validateContact({
    name: formData.get("name"),
    email: formData.get("email"),
    company: formData.get("company"),
    message: formData.get("message"),
  });

  if (!result.ok) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: result.fieldErrors,
    };
  }

  try {
    const email = contactEmail(result.value);
    await sendEmail({
      to: CONTACT_RECIPIENT,
      subject: email.subject,
      html: email.html,
      text: email.text,
      // Permet de répondre directement à l'expéditeur depuis la boîte mail.
      replyTo: result.value.email,
    });
  } catch {
    return {
      status: "error",
      message:
        "Something went wrong while sending your message. Please try again, or email us directly.",
    };
  }

  return {
    status: "success",
    message: "Thanks for reaching out. We will get back to you shortly.",
  };
}
