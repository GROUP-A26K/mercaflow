// UI de chargement (Suspense boundary) du segment racine. Server Component.
export default function Loading() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <div
        className="size-6 animate-spin rounded-full border-2 border-muted border-t-foreground"
        role="status"
        aria-label="Chargement"
      />
    </div>
  );
}
