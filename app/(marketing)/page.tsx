import { IconSparkles } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { AiLogoCycler } from "@/components/blocks/ai-logo-cycler";
import { Benefits } from "@/components/blocks/benefits";
import { BrandMarquee } from "@/components/blocks/brand-marquee";
import { HowItWorks } from "@/components/blocks/how-it-works";
import { HeroSearch } from "@/components/blocks/hero-search";
import { SocialProof } from "@/components/blocks/social-proof";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata } from "@/lib/seo/metadata";
import { webPageJsonLd } from "@/lib/seo/json-ld";

export const metadata = buildMetadata({ path: "/" });

// Page d'accueil publique → URL `/` (le groupe (marketing) n'ajoute rien au chemin).
export default function HomePage() {
  return (
    <main className="relative isolate mx-auto w-full max-w-6xl flex-1 px-6 py-16 sm:py-24">
      <JsonLd data={webPageJsonLd({ name: "Accueil", path: "/" })} />

      {/* Décor de fond du hero : lignes verticales fines en gradient */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto flex h-[40rem] max-w-4xl justify-between px-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-full w-px bg-linear-to-b from-transparent via-foreground/6 to-transparent"
          />
        ))}
      </div>

      {/* Hero */}
      <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
        <Badge variant="outline" className="gap-1.5 glass py-1">
          <IconSparkles className="size-3.5 text-primary" />
          Intelligence produit · Commerce agentique
        </Badge>
        <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-6xl">
          Vos produits sont-ils{" "}
          <span className="text-muted-foreground">recommandés par </span>
          <AiLogoCycler /> ?
        </h1>
        <p className="max-w-xl text-lg text-pretty text-muted-foreground">
          Mercaflow révèle quels SKU sont recommandés ou invisibles dans
          ChatGPT, Perplexity et Gemini, et génère les corrections qui les
          rendent recommandables.
        </p>
        <HeroSearch />

        {/* Séparateur : même couleur/style que les lignes de fond (dégradé foreground/6) */}
        <div className="h-px w-full max-w-xs bg-linear-to-r from-transparent via-foreground/6 to-transparent" />

        <SocialProof />
      </section>

      {/* Carrousel de marques */}
      <section className="mt-16 sm:mt-20">
        <BrandMarquee />
      </section>

      {/* Benefits (style peec.ai), boxé en "well" gris clair */}
      <section className="mt-20 sm:mt-28">
        <div className="rounded-3xl border border-foreground/10 bg-muted/40 p-8 sm:p-12">
          <div className="mb-10 flex max-w-2xl flex-col gap-2">
            <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
              Understand how AI sees your products
            </h2>
            <p className="text-muted-foreground">
              We track the metrics that matter most in AI search.
            </p>
          </div>
          <Benefits />
        </div>
      </section>

      {/* How it works */}
      <section className="mt-20 sm:mt-28">
        <div className="mb-10 flex flex-col items-center gap-2 text-center">
          <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            How it works
          </h2>
          <p className="text-muted-foreground">
            From catalog to AI-recommended in three steps.
          </p>
        </div>
        <HowItWorks />
      </section>
    </main>
  );
}
