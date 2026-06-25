import Link from "next/link";

const LINKS = [
  { label: "Produit", href: "/" },
  { label: "Pricing", href: "/pricing" },
  { label: "Docs", href: "/" },
  { label: "Contact", href: "/contact" },
];

function MainLinks() {
  return (
    <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-normal text-neutral-400">
      {LINKS.map((l) => (
        <Link
          key={l.label}
          href={l.href}
          className="transition-colors hover:text-white"
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-6xl px-6 pt-24 pb-10">
      <div className="relative overflow-hidden rounded-3xl border-2 border-white/30 bg-linear-to-b from-neutral-800 via-neutral-950 to-black px-6 pt-12 inset-shadow-2xs inset-shadow-white/10">
        {/* Sheen radial en haut (profondeur, monochrome) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 bg-radial-[at_50%_-20%] from-white/15 via-transparent to-transparent"
        />
        {/* Halo gris diffus en bas */}
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-28 left-1/2 z-0 h-64 w-[44rem] -translate-x-1/2 rounded-full bg-white/10 blur-3xl"
        />

        {/* Contenu */}
        <div className="relative z-10 flex flex-col items-center gap-5 text-center">
          <MainLinks />
          <p className="text-xs text-neutral-500">
            © {new Date().getFullYear()} Mercaflow. Tous droits réservés.
          </p>
        </div>

        {/* Wordmark plein cadre, collé en bottom 0 : gris foncé, dégradé de
            visibilité (fondu vers le bas via le masque). */}
        <div
          aria-hidden
          className="pointer-events-none relative z-[1] mt-8 translate-y-[0.18em] select-none"
        >
          <span className="block w-full bg-linear-to-b from-neutral-500 via-neutral-700 to-neutral-900 bg-clip-text text-center font-heading text-[clamp(2.5rem,16vw,12rem)] font-semibold leading-[0.8] tracking-[-0.04em] whitespace-nowrap text-transparent [mask-image:linear-gradient(to_bottom,#000_55%,transparent)] [-webkit-mask-image:linear-gradient(to_bottom,#000_55%,transparent)]">
            Mercaflow
          </span>
        </div>
      </div>
    </footer>
  );
}
