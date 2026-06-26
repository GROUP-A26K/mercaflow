"use client";

import { useEffect, useState } from "react";
import { IconEye, IconMoodSmile, IconTrophy } from "@tabler/icons-react";
import { SiAdidas, SiNike } from "@icons-pack/react-simple-icons";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const DURATION_MS = 5000;

const METRICS = [
  {
    icon: IconEye,
    title: "Visibility",
    text: "See the share of AI answers where your product is mentioned, and how often it shows up.",
  },
  {
    icon: IconTrophy,
    title: "Position",
    text: "Understand your product's rank within AI answers and uncover ways to climb.",
  },
  {
    icon: IconMoodSmile,
    title: "Sentiment",
    text: "Find out how your product is perceived by AI: what works and what to fix.",
  },
];

// Animation d'entrée différente à chaque changement de carte (littéraux = détectés par Tailwind).
const ENTER = ["slide-in-from-right-4", "slide-in-from-bottom-4", "zoom-in-95"];

// Micro-animation propre à chaque icône, jouée quand sa case est active (motion-safe).
const ICON_ANIM = [
  "motion-safe:animate-[icon-pulse-soft_2.4s_ease-in-out_infinite]",
  "motion-safe:animate-[icon-bob_1.8s_ease-in-out_infinite]",
  "motion-safe:animate-[icon-wiggle_2.6s_ease-in-out_infinite]",
];

// Coque commune du mockup (label + question + réponse), avec le contenu spécifique en enfants.
function MockShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl glass p-5 shadow-xl ring-1 shadow-foreground/5 ring-foreground/10">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="size-2 rounded-full bg-primary" />
        AI answer
      </div>
      <p className="mt-3 font-medium">What are the best trail running shoes?</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Here is a quick breakdown of the top trail shoes for 2025.
      </p>
      {children}
    </div>
  );
}

function MockVisibility() {
  return (
    <MockShell>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-accent/50 p-3 ring-1 ring-foreground/10">
        <span className="flex items-center gap-2 font-medium">
          <SiNike color="default" className="size-5" />
          Nike Pegasus Trail
        </span>
        <Badge>Mentioned</Badge>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Mentioned in{" "}
        <span className="font-medium text-foreground tabular-nums">62%</span> of
        AI answers.
      </p>
    </MockShell>
  );
}

function MockPosition() {
  return (
    <MockShell>
      <div className="mt-4 flex items-start gap-3 rounded-xl bg-accent/50 p-3 ring-1 ring-foreground/10">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground tabular-nums">
          1
        </span>
        <SiNike color="default" className="mt-0.5 size-5 shrink-0" />
        <div>
          <div className="flex items-center gap-2 font-medium">
            Nike Pegasus Trail
            <Badge>Recommended</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            A great all-rounder for mixed terrain.
          </p>
        </div>
      </div>
      <div className="mt-2 flex items-start gap-3 p-3 text-muted-foreground">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
          2
        </span>
        <SiAdidas className="mt-0.5 size-5 shrink-0" />
        <div className="font-medium text-foreground">Adidas Terrex</div>
      </div>
    </MockShell>
  );
}

function MockSentiment() {
  return (
    <MockShell>
      <div className="mt-4 flex flex-wrap gap-2">
        <Badge variant="secondary">Reliable</Badge>
        <Badge variant="secondary">Comfortable</Badge>
        <Badge variant="secondary">Great grip</Badge>
        <Badge variant="destructive">Pricey</Badge>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Mostly positive: comfort and grip stand out, price is the main
        watch-out.
      </p>
    </MockShell>
  );
}

const MOCKS = [MockVisibility, MockPosition, MockSentiment];

export function Benefits() {
  const [active, setActive] = useState(0);

  // Auto-défile : avance après DURATION_MS ; un clic réinitialise le minuteur.
  useEffect(() => {
    const id = setTimeout(
      () => setActive((a) => (a + 1) % METRICS.length),
      DURATION_MS,
    );
    return () => clearTimeout(id);
  }, [active]);

  const Mock = MOCKS[active];

  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className="flex flex-col gap-2">
        {METRICS.map((m, i) => {
          const isActive = i === active;
          return (
            <button
              key={m.title}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "flex w-full gap-4 rounded-xl p-3 text-left transition-colors",
                isActive ? "bg-accent/60" : "opacity-60 hover:opacity-100",
              )}
            >
              <span
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors duration-300",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-accent text-accent-foreground",
                )}
              >
                <m.icon className={cn("size-5", isActive && ICON_ANIM[i])} />
              </span>
              <div className="flex-1">
                <h3 className="font-heading text-lg font-medium">{m.title}</h3>
                <p className="mt-1 text-sm text-pretty text-muted-foreground">
                  {m.text}
                </p>
                <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-foreground/8">
                  {isActive && (
                    <div
                      key={active}
                      className="h-full w-0 animate-[progress-fill_5s_linear_forwards] rounded-full bg-foreground/30 motion-reduce:w-full"
                    />
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div
        key={active}
        className={cn(
          "animate-in duration-500 fade-in motion-reduce:animate-none",
          ENTER[active],
        )}
      >
        <Mock />
      </div>
    </div>
  );
}
