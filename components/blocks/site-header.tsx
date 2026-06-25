import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { MobileNav } from "@/components/blocks/mobile-nav";
import { NavLinks } from "@/components/blocks/nav-links";

// En-tête "Split Islands" : deux îlots en verre liquide (logo / actions), flottants.

function Brand() {
  return (
    <Link
      href="/"
      aria-label="Homepage"
      className="flex items-center gap-2 font-heading text-lg font-semibold tracking-tight"
    >
      <span className="size-5 rounded-md bg-primary" />
      Mercaflow
    </Link>
  );
}

function AuthActions() {
  return (
    <div className="flex items-center gap-2">
      <Show when="signed-out">
        <Button asChild variant="secondary">
          <Link href="/sign-in">Sign in</Link>
        </Button>
        {/* Sheen de "swipe" : un reflet traverse le bouton au survol. */}
        <Button
          asChild
          className="relative overflow-hidden after:absolute after:inset-0 after:-translate-x-full after:bg-linear-to-r after:from-transparent after:via-white/25 after:to-transparent after:transition-transform after:duration-500 after:ease-out after:content-[''] hover:after:translate-x-full"
        >
          <Link href="/sign-up">Sign up</Link>
        </Button>
      </Show>
      <Show when="signed-in">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard">Tableau de bord</Link>
        </Button>
        <UserButton />
      </Show>
    </div>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-4 z-50 mx-auto flex w-[min(72rem,calc(100%-2rem))] items-center justify-between gap-3">
      {/* Îlot logo */}
      <div className="glass-strong flex h-12 items-center rounded-full px-5 ring-1 ring-foreground/10 shadow-lg shadow-foreground/5">
        <Brand />
      </div>

      {/* Îlot actions — desktop */}
      <div className="glass-strong hidden h-12 items-center gap-3 rounded-full px-4 ring-1 ring-foreground/10 shadow-lg shadow-foreground/5 md:flex">
        <NavLinks />
        <AuthActions />
      </div>

      {/* Îlot menu — mobile */}
      <div className="glass-strong flex h-12 items-center rounded-full px-2 ring-1 ring-foreground/10 shadow-lg shadow-foreground/5 md:hidden">
        <MobileNav />
      </div>
    </header>
  );
}
