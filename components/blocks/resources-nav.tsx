"use client";

import Link from "next/link";
import {
  IconArrowRight,
  IconBook2,
  IconChartBar,
  IconChevronDown,
  IconHistory,
  IconNews,
} from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Mêmes classes que <NavLink> du site-header (pilule + swipe d'accent au survol),
// adaptées à un bouton de déclenchement avec chevron qui pivote à l'ouverture.
const TRIGGER_CLASSES =
  "relative isolate inline-flex items-center gap-1 overflow-hidden rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors outline-none hover:text-accent-foreground before:absolute before:inset-0 before:-z-10 before:-translate-x-full before:rounded-full before:bg-accent before:transition-transform before:duration-300 before:ease-out before:content-[''] hover:before:translate-x-0 focus-visible:text-accent-foreground data-[state=open]:text-accent-foreground data-[state=open]:before:translate-x-0 data-[state=open]:[&>svg]:rotate-180";

type Resource = {
  label: string;
  desc: string;
  href: string;
  icon: typeof IconNews;
  badge?: string;
};

const resources: Resource[] = [
  {
    label: "Blog",
    desc: "Product news and playbooks",
    href: "/",
    icon: IconNews,
  },
  {
    label: "Documentation",
    desc: "Guides and API reference",
    href: "/",
    icon: IconBook2,
  },
  {
    label: "Case studies",
    desc: "Results from Shopify Plus brands",
    href: "/",
    icon: IconChartBar,
    badge: "Popular",
  },
  {
    label: "Changelog",
    desc: "Latest product updates",
    href: "/",
    icon: IconHistory,
    badge: "New",
  },
];

// Menu "Resources" : panneau large avec les liens à gauche et une carte mise en avant
// (rapport phare) à droite.
export function ResourcesNav() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={TRIGGER_CLASSES}>
        Resources
        <IconChevronDown className="size-3.5 transition-transform duration-200" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={14}
        collisionPadding={16}
        className="resources-menu w-[min(40rem,calc(100vw-2rem))] p-2"
      >
        <div className="grid grid-cols-[1.3fr_1fr] gap-2">
          <div className="flex flex-col gap-1">
            {resources.map((r) => (
              <DropdownMenuItem
                key={r.label}
                asChild
                className="items-start gap-3 py-2"
              >
                <Link href={r.href}>
                  <r.icon className="mt-0.5 text-primary" />
                  <span className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {r.label}
                      </span>
                      {r.badge ? (
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 text-[10px] font-medium"
                        >
                          {r.badge}
                        </Badge>
                      ) : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {r.desc}
                    </span>
                  </span>
                </Link>
              </DropdownMenuItem>
            ))}
          </div>
          <DropdownMenuItem
            asChild
            className="group/feat flex flex-col items-stretch gap-0 rounded-md bg-foreground/5 p-4 ring-1 ring-foreground/10 focus:bg-foreground/10"
          >
            <Link href="/">
              <Badge variant="outline" className="w-fit">
                Featured
              </Badge>
              <span className="mt-2 font-heading text-sm font-semibold tracking-tight text-pretty text-foreground">
                State of Agentic Commerce 2026
              </span>
              <span className="mt-1 text-xs text-pretty text-muted-foreground">
                How 200+ brands rank across ChatGPT, Perplexity and Gemini.
              </span>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-foreground">
                Read the report
                <IconArrowRight className="size-3.5 transition-transform group-hover/feat:translate-x-0.5" />
              </span>
            </Link>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
