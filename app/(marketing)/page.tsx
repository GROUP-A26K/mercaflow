import Link from "next/link";
import { IconArrowRight, IconSparkles } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ComponentShowcase } from "@/components/blocks/component-showcase";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata } from "@/lib/seo/metadata";
import { webPageJsonLd } from "@/lib/seo/json-ld";

export const metadata = buildMetadata({ path: "/" });

// Page d'accueil publique → URL `/` (le groupe (marketing) n'ajoute rien au chemin).
export default function HomePage() {
  return (
    <main className="isolate mx-auto w-full max-w-6xl flex-1 px-6 py-16 sm:py-24">
      <JsonLd data={webPageJsonLd({ name: "Accueil", path: "/" })} />

      {/* Hero */}
      <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
        <Badge variant="outline" className="glass gap-1.5 py-1">
          <IconSparkles className="size-3.5 text-primary" />
          Intelligence produit · Commerce agentique
        </Badge>
        <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          Vos produits sont-ils{" "}
          <span className="bg-linear-to-r from-primary to-chart-2 bg-clip-text text-transparent">
            recommandés par l&apos;IA
          </span>{" "}
          ?
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground text-pretty">
          Mercaflow révèle quels SKU sont recommandés ou invisibles dans ChatGPT,
          Perplexity et Gemini — et génère les corrections qui les rendent
          recommandables.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/dashboard">
              Lancer un audit
              <IconArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="glass">
            <Link href="/dashboard">Voir le tableau de bord</Link>
          </Button>
        </div>
      </section>

      {/* Kit de composants */}
      <section className="mt-20 sm:mt-28">
        <div className="mb-8 flex flex-col gap-1">
          <h2 className="font-heading text-2xl font-semibold tracking-tight">
            Kit de composants
          </h2>
          <p className="text-muted-foreground">
            Le design system du projet, en style glass.
          </p>
        </div>
        <ComponentShowcase />
      </section>
    </main>
  );
}
