import { SiteHeader } from "@/components/blocks/site-header";

// Layout du groupe (marketing) : pages publiques. Le nom du groupe entre parenthèses
// n'apparaît PAS dans l'URL — il sert juste à partager ce layout.
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
