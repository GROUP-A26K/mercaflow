"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

// Déclencheur d'import du catalogue (MER-55). Client Component minimal : la route
// `POST /api/shopify/ingest` est Clerk-protégée + garde `Sec-Fetch-Site` → un `fetch`
// same-origin depuis cette page authentifiée porte le cookie Clerk ET l'en-tête
// `Sec-Fetch-Site: same-origin` (posé par le navigateur), donc il passe les deux gardes.
// On mappe chaque code de retour de la route sur un message clair (pas d'erreur avalée).

interface IngestButtonProps {
  /** Domaine de la boutique à importer (ciblé via `?shop=` — désambiguïse le multi-boutiques). */
  shopDomain: string;
}

interface Feedback {
  ok: boolean;
  message: string;
}

/** Messages par code HTTP renvoyé par `/api/shopify/ingest` (cf. la route). */
const STATUS_FEEDBACK: Record<number, Feedback> = {
  202: {
    ok: true,
    message: "Import lancé — le catalogue est importé en arrière-plan.",
  },
  409: {
    ok: false,
    message: "Un import est déjà en cours pour cette boutique.",
  },
  400: {
    ok: false,
    message: "Boutique ambiguë — impossible de cibler l'import.",
  },
  404: {
    ok: false,
    message: "Aucune connexion Shopify active pour cette organisation.",
  },
  401: { ok: false, message: "Session expirée — reconnectez-vous." },
  403: { ok: false, message: "Origine non autorisée." },
};

const GENERIC_ERROR: Feedback = {
  ok: false,
  message: "Échec du lancement de l'import — réessayez plus tard.",
};

export function IngestButton({ shopDomain }: IngestButtonProps) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function launchIngestion() {
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/shopify/ingest?shop=${encodeURIComponent(shopDomain)}`,
        { method: "POST" },
      );
      // Un code connu → message dédié ; sinon 2xx inconnu = succès générique, autre = échec.
      const known = STATUS_FEEDBACK[response.status];
      if (known) {
        setFeedback(known);
      } else if (response.ok) {
        setFeedback({ ok: true, message: "Import lancé." });
      } else {
        setFeedback(GENERIC_ERROR);
      }
    } catch {
      // Erreur réseau (fetch rejeté) : jamais avalée silencieusement.
      setFeedback({
        ok: false,
        message: "Impossible de contacter le serveur.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" onClick={launchIngestion} disabled={pending}>
        {pending ? "Lancement…" : "Importer le catalogue"}
      </Button>
      {feedback ? (
        <p
          role="status"
          className={
            feedback.ok
              ? "text-sm text-muted-foreground"
              : "text-sm text-destructive"
          }
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
