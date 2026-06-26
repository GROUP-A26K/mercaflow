"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconMenu2 } from "@tabler/icons-react";
import { Show, UserButton } from "@clerk/nextjs";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// `match` = route servant à l'état actif. Resources est un placeholder (href "/") →
// pas de match, donc jamais marqué actif (sinon il s'allumerait sur la home avec Produit).
const links: { href: string; label: string; match?: string }[] = [
  { href: "/", label: "Produit", match: "/" },
  { href: "/pricing", label: "Pricing", match: "/pricing" },
  { href: "/", label: "Resources" },
];

function isActive(pathname: string, match?: string) {
  if (!match) return false;
  return match === "/" ? pathname === "/" : pathname.startsWith(match);
}

// Sheen de swipe sur le bouton Sign up (comme le desktop).
const SHEEN =
  "relative overflow-hidden after:absolute after:inset-0 after:-translate-x-full after:bg-linear-to-r after:from-transparent after:via-white/25 after:to-transparent after:transition-transform after:duration-500 after:ease-out after:content-[''] hover:after:translate-x-full";

function NavItems({ onSelect }: { onSelect: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {links.map((link) => {
        const active = isActive(pathname, link.match);
        return (
          <Link
            key={link.label}
            href={link.href}
            onClick={onSelect}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative isolate block overflow-hidden rounded-full px-4 py-2.5 text-sm transition-colors before:absolute before:inset-0 before:-z-10 before:rounded-full before:bg-accent before:transition-transform before:duration-300 before:ease-out before:content-['']",
              active
                ? "text-accent-foreground before:translate-x-0"
                : "text-muted-foreground before:-translate-x-full hover:text-accent-foreground hover:before:translate-x-0",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

function AuthItems({ onSelect }: { onSelect: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      <Show when="signed-out">
        <Button asChild variant="secondary" className="w-full">
          <Link href="/sign-in" onClick={onSelect}>
            Sign in
          </Link>
        </Button>
        <Button asChild className={cn("w-full", SHEEN)}>
          <Link href="/sign-up" onClick={onSelect}>
            Sign up
          </Link>
        </Button>
      </Show>
      <Show when="signed-in">
        <Button asChild variant="secondary" className="w-full">
          <Link href="/dashboard" onClick={onSelect}>
            Tableau de bord
          </Link>
        </Button>
        <div className="flex justify-center pt-1">
          <UserButton />
        </div>
      </Show>
    </div>
  );
}

// Menu mobile (sous md) : dropdown pleine largeur sous le bouton, aligné sur les marges
// du header (1rem de chaque côté, pas collé aux bords). Style glass identique à l'îlot
// desktop. Ouverture animée (fade + zoom + slide depuis le haut).
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  // Ferme le menu si on repasse en desktop (md+) : sinon le contenu portalisé
  // resterait ouvert alors que l'îlot mobile est masqué. On ferme depuis le
  // callback de l'événement (pas de setState synchrone dans le corps de l'effet).
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (mql.matches) setOpen(false);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Ouvrir le menu">
          <IconMenu2 />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        // Le bouton ☰ est en retrait de ~8px (px-2 de l'îlot) → on pousse le menu
        // vers la droite pour que son bord s'aligne sur le bord de l'îlot ☰.
        alignOffset={-8}
        sideOffset={12}
        collisionPadding={16}
        className="w-[calc(100vw-2rem)] max-w-none rounded-3xl bg-[color-mix(in_oklch,var(--card),transparent_14%)] p-2.5 shadow-xl ring-1 inset-shadow-2xs shadow-foreground/10 ring-foreground/10 inset-shadow-white/40 backdrop-blur-xl backdrop-saturate-200"
      >
        <NavItems onSelect={close} />
        <div className="mt-2.5 border-t border-foreground/10 px-1.5 pt-3">
          <AuthItems onSelect={close} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
