import {
  IconChartBar,
  IconPlugConnected,
  IconWand,
} from "@tabler/icons-react";

const STEPS = [
  {
    n: 1,
    icon: IconPlugConnected,
    title: "Connect your catalog",
    text: "Sync Shopify, Merchant Center or your PIM in a few clicks.",
  },
  {
    n: 2,
    icon: IconChartBar,
    title: "Get your SKU scores",
    text: "See which products are recommended or invisible across ChatGPT, Perplexity and Gemini, and why.",
  },
  {
    n: 3,
    icon: IconWand,
    title: "Apply the fixes",
    text: "Push ready-to-use corrections and climb the AI rankings.",
  },
];

export function HowItWorks() {
  return (
    <div className="grid gap-6 sm:grid-cols-3">
      {STEPS.map((s) => (
        <div
          key={s.n}
          className="relative overflow-hidden rounded-xl border border-foreground/10 p-6"
        >
          <span className="absolute -top-4 right-0 font-heading text-8xl font-bold text-foreground/5 tabular-nums">
            {s.n}
          </span>
          <s.icon className="size-6 text-muted-foreground" />
          <h3 className="mt-3 font-heading font-medium">{s.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
        </div>
      ))}
    </div>
  );
}
