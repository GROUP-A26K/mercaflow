import Link from "next/link";
import {
  IconCalendarX,
  IconLockOpen,
  IconTag,
  IconWorld,
} from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata } from "@/lib/seo/metadata";
import { breadcrumbJsonLd, webPageJsonLd } from "@/lib/seo/json-ld";
import { PricingTiers } from "./_components/pricing-tiers";

export const metadata = buildMetadata({
  title: "Pricing",
  description:
    "Agentic audit delivered in 72 hours, then continuous measurement and fixing of your SKUs. Three plans to make your products recommendable by AI.",
  path: "/pricing",
});

const trustPoints = [
  { label: "No commitment", icon: IconLockOpen },
  { label: "Data hosted in the EU", icon: IconWorld },
  { label: "Cancel anytime", icon: IconCalendarX },
];

// Bandeau de chiffres clés sous les offres.
const stats = [
  { value: "200+", label: "Shopify Plus brands" },
  { value: "1.2M", label: "SKUs audited" },
  { value: "+38%", label: "recommended SKUs after fixes" },
  { value: "72h", label: "average audit delivery" },
];

const faq = [
  {
    q: "What is an agentic audit?",
    a: "We query ChatGPT, Perplexity and Gemini about your categories and measure which SKUs are recommended, ignored or misunderstood, and why.",
  },
  {
    q: "How does the Fix Engine work?",
    a: "It generates the feed and product-page corrections that make your SKUs understandable to agents, then automatically re-tests their impact.",
  },
  {
    q: "Can I change plans at any time?",
    a: "Yes. You can move from the audit to Growth, or upgrade to Scale, with no commitment and no hidden fees.",
  },
  {
    q: "Is my data secure?",
    a: "Your catalogs are hosted in the EU and never shared. You keep control of your Shopify, Merchant Center and PIM connectors.",
  },
];

// Données structurées FAQ (rich snippet Google) construites depuis le contenu de la page.
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faq.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export default function PricingPage() {
  return (
    <main className="relative isolate mx-auto w-full max-w-6xl flex-1 px-6 py-16 sm:py-24">
      <JsonLd data={webPageJsonLd({ name: "Pricing", path: "/pricing" })} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Pricing", path: "/pricing" },
        ])}
      />
      <JsonLd data={faqJsonLd} />

      {/* Décor de fond : lignes verticales fines en gradient (cohérent avec l'accueil) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto flex h-[40rem] max-w-4xl justify-between px-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-full w-px bg-linear-to-b from-transparent via-foreground/6 to-transparent"
          />
        ))}
      </div>

      {/* Heading group */}
      <section className="flex flex-col items-center gap-6 text-center">
        <Badge variant="outline" className="glass gap-1.5 py-1">
          <IconTag className="size-3.5 text-primary" />
          Pricing
        </Badge>
        <h1 className="mx-auto max-w-[24ch] font-heading text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-6xl">
          Pricing built around{" "}
          <span className="text-muted-foreground">your SKUs</span>
        </h1>
        <p className="mx-auto max-w-[48ch] text-lg text-pretty text-muted-foreground">
          Start with an audit, switch to continuous when you are ready. No
          commitment.
        </p>
      </section>

      {/* Plans */}
      <section className="mx-auto mt-16 max-w-5xl">
        <PricingTiers />

        {/* Réassurance — barre glass segmentée, une icône distincte par garantie. */}
        <ul className="glass mx-auto mt-10 flex w-fit max-w-full flex-col divide-y divide-border overflow-hidden rounded-2xl text-sm text-muted-foreground shadow-sm ring-1 ring-foreground/10 sm:flex-row sm:divide-x sm:divide-y-0">
          {trustPoints.map((point) => (
            <li
              key={point.label}
              className="flex items-center justify-center gap-2 px-5 py-2.5"
            >
              <point.icon className="size-4 shrink-0 text-primary" />
              {point.label}
            </li>
          ))}
        </ul>
      </section>

      {/* Trust — bandeau de chiffres clés. */}
      <section className="mt-20 sm:mt-28">
        <p className="text-center text-sm font-medium text-muted-foreground">
          Trusted by merchandising teams worldwide
        </p>
        <dl className="mt-8 grid grid-cols-2 gap-y-10 sm:grid-cols-4 sm:divide-x sm:divide-border">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col items-center gap-1 px-4 text-center"
            >
              <dt className="font-heading text-4xl font-semibold tracking-tight">
                {stat.value}
              </dt>
              <dd className="max-w-[18ch] text-sm text-pretty text-muted-foreground">
                {stat.label}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* FAQ — split asymétrique : titre + CTA à gauche (sticky), accordéon à droite. */}
      <section className="mt-24 sm:mt-32">
        <div className="grid gap-x-8 gap-y-10 lg:grid-cols-[1fr_1.5fr]">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <h2 className="font-heading text-2xl font-semibold tracking-tight">
              Frequently asked questions
            </h2>
            <p className="mt-3 max-w-[40ch] text-sm text-pretty text-muted-foreground">
              Everything you need to know about audits, fixes and plans.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-5">
              <Link href="mailto:jb@mercaflow.ai">Talk to an expert</Link>
            </Button>
          </div>
          <Accordion
            type="single"
            collapsible
            defaultValue="faq-0"
            className="w-full"
          >
            {faq.map((item, i) => (
              <AccordionItem key={item.q} value={`faq-${i}`}>
                <AccordionTrigger className="text-base">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="max-w-[60ch] text-pretty text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    </main>
  );
}
