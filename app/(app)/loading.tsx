// UI de chargement de la zone authentifiée (app). Server Component.
export default function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center py-20">
      <div
        className="size-6 animate-spin rounded-full border-2 border-muted border-t-foreground"
        role="status"
        aria-label="Chargement"
      />
    </div>
  );
}
