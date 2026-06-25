import Link from "next/link";

import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata } from "@/lib/seo/metadata";
import { webPageJsonLd } from "@/lib/seo/json-ld";

export const metadata = buildMetadata({ path: "/" });

// Page d'accueil publique → URL `/` (le groupe (marketing) n'ajoute rien au chemin).
export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <JsonLd data={webPageJsonLd({ name: "Accueil", path: "/" })} />
      <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance">
        Mercaflow
      </h1>
      <p className="text-muted-foreground max-w-md text-lg text-pretty">
        Point de départ du projet. Remplacez cette page par votre landing.
      </p>
      <Button asChild size="lg">
        <Link href="/dashboard">Accéder au tableau de bord</Link>
      </Button>
    </main>
  );
}
