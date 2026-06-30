import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Composant PRIVÉ à /dashboard. Server Component : un simple <form method="get">
// vers la route d'install OAuth (MER-24) — aucune interactivité cliente, donc pas
// de 'use client'. La soumission est une navigation same-origin → elle satisfait le
// garde `Sec-Fetch-Site` de `/api/shopify/install`. La validation fait autorité côté
// serveur ; le `pattern` n'est qu'une aide de saisie cliente.
export function ConnectShopifyCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connecter Shopify</CardTitle>
        <CardDescription>
          Saisissez le domaine de votre boutique pour lancer l&apos;installation
          et autoriser l&apos;accès en lecture seule à votre catalogue.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          action="/api/shopify/install"
          method="get"
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-2">
            <Label htmlFor="shop">Domaine de la boutique</Label>
            <Input
              id="shop"
              name="shop"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="ma-boutique.myshopify.com"
              pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?\.myshopify\.com"
              required
              aria-describedby="shop-hint"
            />
            <p id="shop-hint" className="text-xs text-muted-foreground">
              Format attendu : <code>nom.myshopify.com</code>
            </p>
          </div>
          <Button type="submit">Connecter</Button>
        </form>
      </CardContent>
    </Card>
  );
}
