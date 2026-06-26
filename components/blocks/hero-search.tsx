"use client";

import { useState } from "react";
import Link from "next/link";
import { IconSearch } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";

const EXAMPLES = ["Nike Pegasus 41", "CeraVe nettoyant", "Veste North Face"];

// Pilule de recherche (action principale du hero), avec liseré shimmer.
// Son bouton "Analyser" est le SEUL bouton primaire de la page.
function Pill({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="fx-border fx-shimmer relative w-full max-w-lg rounded-full">
      <div className="flex items-center gap-2 rounded-full glass-strong p-1.5 pl-5 ring-1 ring-foreground/10">
        <IconSearch className="size-5 shrink-0 text-muted-foreground" />
        <input
          name="product"
          aria-label="Produit à tester"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Entrez un produit à tester"
          className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
        />
        <Button className="rounded-full" asChild>
          <Link href="/dashboard">Analyser</Link>
        </Button>
      </div>
    </div>
  );
}

// Exemples cliquables en pastilles "glass" — pré-remplissent le champ.
function Chips({ onPick }: { onPick: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {EXAMPLES.map((ex) => (
        <button
          key={ex}
          type="button"
          onClick={() => onPick(ex)}
          className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-1.5 text-sm ring-1 ring-foreground/10 hover:bg-accent hover:text-accent-foreground"
        >
          <IconSearch className="size-3.5 text-muted-foreground" />
          {ex}
        </button>
      ))}
    </div>
  );
}

export function HeroSearch() {
  const [value, setValue] = useState("");

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <Pill value={value} onChange={setValue} />
      <Chips onPick={setValue} />
    </div>
  );
}
