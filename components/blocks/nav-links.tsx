"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { ResourcesNav } from "@/components/blocks/resources-nav";

const links = [
  { href: "/", label: "Produit" },
  { href: "/pricing", label: "Pricing" },
];

// Lien de nav : pilule avec swipe d'accent au survol. Quand le lien correspond à la
// page courante, la pilule reste remplie (état "sélectionné").
function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative isolate overflow-hidden rounded-full px-3 py-1.5 text-sm transition-colors before:absolute before:inset-0 before:-z-10 before:rounded-full before:bg-accent before:transition-transform before:duration-300 before:ease-out before:content-['']",
        active
          ? "text-accent-foreground before:translate-x-0"
          : "text-muted-foreground before:-translate-x-full hover:text-accent-foreground hover:before:translate-x-0",
      )}
    >
      {children}
    </Link>
  );
}

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1">
      {links.map((l) => (
        <NavLink key={l.href} href={l.href} active={pathname === l.href}>
          {l.label}
        </NavLink>
      ))}
      <ResourcesNav />
    </nav>
  );
}
