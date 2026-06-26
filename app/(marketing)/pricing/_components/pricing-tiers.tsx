import Link from "next/link";
import { IconCheck, IconSparkles } from "@tabler/icons-react";
import {
  SiSamsung,
  SiSamsungHex,
  SiShopify,
  SiShopifyHex,
  SiStarbucks,
  SiStarbucksHex,
  SiVeepee,
  SiVeepeeHex,
  SiZalando,
  SiZalandoHex,
} from "@icons-pack/react-simple-icons";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Tier = {
  name: string;
  description: string;
  price: string;
  /** Ex. "/ month" ou "one-time". Vide pour "Custom". */
  priceSuffix?: string;
  features: string[];
  cta: {
    label: string;
    href: string;
    variant: "default" | "outline";
  };
  /** La meilleure offre : bordure shimmer + carte qui dépasse de la grille. */
  featured?: boolean;
};

// Source des offres. 3 paliers alignés sur le GTM : audit ponctuel (wedge) → SaaS Growth → Scale.
export const tiers: Tier[] = [
  {
    name: "Audit",
    description: "The 72-hour diagnostic to know where you stand.",
    price: "$89",
    priceSuffix: "one-time",
    features: [
      "Agentic audit of 100 SKUs",
      "Product Understanding Score (7 axes)",
      "Visibility in ChatGPT, Perplexity and Gemini",
      "Prioritized fix report",
      "Review session with an expert",
    ],
    cta: { label: "Start the audit", href: "/sign-up", variant: "outline" },
  },
  {
    name: "Growth",
    description: "Measure and fix continuously, across your whole catalog.",
    price: "$139",
    priceSuffix: "/ month",
    features: [
      "Everything in Audit, continuously",
      "Up to 2,500 tracked SKUs",
      "Fix Engine: feed & PDP corrections",
      "Automatic weekly re-testing",
      "Agent-Readable Feed (.well-known)",
      "Shopify & Merchant Center connectors",
      "Priority support",
    ],
    cta: { label: "Get started", href: "/sign-up", variant: "default" },
    featured: true,
  },
  {
    name: "Scale",
    description: "For complex catalogs and merchandising teams.",
    price: "Custom",
    features: [
      "Unlimited SKUs, multi-catalog",
      "Workflow Actions + MCP (Akeneo, Jira)",
      "Dedicated Product Intelligence Graph",
      "PIM, reviews and marketplace integrations",
      "Onboarding via partner agency",
      "Dedicated CSM and SLA",
    ],
    cta: {
      label: "Talk to an expert",
      href: "mailto:jb@mercaflow.ai",
      variant: "outline",
    },
  },
];

// Couleurs variées (orange / bleu / rose / vert / noir) pour un band coloré, pas que noir/rouge.
const TRUST_BRANDS = [
  { Logo: SiZalando, hex: SiZalandoHex }, // orange
  { Logo: SiSamsung, hex: SiSamsungHex }, // bleu
  { Logo: SiVeepee, hex: SiVeepeeHex }, // rose
  { Logo: SiStarbucks, hex: SiStarbucksHex }, // vert
];

// Preuve sociale sous le CTA (conversion) : avatars aux couleurs de marque + Shopify.
function CardTrust() {
  return (
    <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
      <div className="flex -space-x-1.5">
        {TRUST_BRANDS.map(({ Logo, hex }, i) => (
          <Avatar key={i} className="size-6 ring-2 ring-background">
            <AvatarFallback style={{ backgroundColor: hex }}>
              <Logo className="size-3.5" color="#fff" />
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
      <span className="flex items-center gap-1">
        Rejoint par 200+ marques
        <SiShopify
          className="size-3.5"
          color={SiShopifyHex}
          aria-label="Shopify"
        />
      </span>
    </div>
  );
}

function PricingCard({ tier }: { tier: Tier }) {
  const { featured } = tier;

  return (
    <div
      data-featured={featured ? "" : undefined}
      className={cn(
        "relative flex flex-col justify-between rounded-2xl p-8",
        featured
          ? // Meilleure offre : verre renforcé + liseré shimmer animé, dépasse en haut et en bas.
            "fx-border fx-shimmer glass-strong shadow-xl ring-1 shadow-foreground/10 ring-foreground/15 lg:row-span-full"
          : "glass shadow-lg ring-1 shadow-foreground/5 ring-foreground/10 lg:row-start-2",
      )}
    >
      {featured ? (
        // Badge centré à cheval sur la bordure haute (au-dessus du bord de la carte).
        <Badge className="absolute top-0 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 gap-1 py-1 shadow-sm">
          <IconSparkles className="size-3.5" />
          Recommended
        </Badge>
      ) : null}

      <div>
        <h3 className="font-heading text-lg font-semibold tracking-tight">
          {tier.name}
        </h3>

        <p className="mt-2 text-sm text-pretty text-muted-foreground">
          {tier.description}
        </p>

        <div className="mt-6 flex items-baseline gap-1.5">
          <span className="font-heading text-4xl font-semibold tracking-tight">
            {tier.price}
          </span>
          {tier.priceSuffix ? (
            <span className="text-sm text-muted-foreground">
              {tier.priceSuffix}
            </span>
          ) : null}
        </div>

        <ul className="mt-8 flex flex-col gap-3 text-sm">
          {tier.features.map((feature) => (
            <li key={feature} className="flex gap-2.5">
              <IconCheck className="size-4 h-lh shrink-0 text-primary" />
              <span className="text-pretty">{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8">
        <Button asChild size="lg" variant={tier.cta.variant} className="w-full">
          <Link href={tier.cta.href}>{tier.cta.label}</Link>
        </Button>
        {/* Preuve sociale in-card (conversion). */}
        <CardTrust />
      </div>
    </div>
  );
}

export function PricingTiers() {
  // Grille avec lignes explicites : la carte mise en avant occupe les 3 lignes et
  // dépasse de --spacing(6) en haut et en bas ; les autres se calent sur la ligne
  // du milieu. Pas de marges négatives (cf. guidelines pricing-cards).
  return (
    <div className="grid gap-6 lg:grid-cols-3 lg:grid-rows-[--spacing(6)_1fr_--spacing(6)] lg:gap-y-0">
      {tiers.map((tier) => (
        <PricingCard key={tier.name} tier={tier} />
      ))}
    </div>
  );
}
