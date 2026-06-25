"use client";

import Marquee from "react-fast-marquee";
import {
  SiAdidas,
  SiHandm,
  SiNewbalance,
  SiNike,
  SiPuma,
  SiReebok,
  SiThenorthface,
  SiUniqlo,
  SiUnderarmour,
  SiZara,
} from "@icons-pack/react-simple-icons";

const LOGOS = [
  SiNike,
  SiAdidas,
  SiPuma,
  SiNewbalance,
  SiReebok,
  SiUnderarmour,
  SiThenorthface,
  SiZara,
  SiUniqlo,
  SiHandm,
];

// Carrousel de marques : grille encadrée, séparateurs en dégradé très discrets,
// stop au survol, fondu aux bords. Le masque atténue aussi les filets haut/bas sur
// les côtés, ce qui donne un cadre dégradé naturel.
export function BrandMarquee() {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-center text-xs tracking-wide text-muted-foreground uppercase">
        Built for brands like these
      </p>
      <div className="border-y border-foreground/6 [mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent)]">
        <Marquee pauseOnHover speed={28} autoFill gradient={false}>
          {LOGOS.map((Logo, i) => (
            <div
              key={i}
              className="relative flex h-20 w-36 items-center justify-center"
            >
              {/* Séparateur vertical en dégradé (fond transparent en haut/bas) */}
              <span className="pointer-events-none absolute top-0 left-0 h-full w-px bg-linear-to-b from-transparent via-foreground/8 to-transparent" />
              {/* Monochrome (noir/blanc) : s'adapte au thème, neutre et non agressif. */}
              <Logo className="size-8 text-muted-foreground transition-colors hover:text-foreground" />
            </div>
          ))}
        </Marquee>
      </div>
    </div>
  );
}
