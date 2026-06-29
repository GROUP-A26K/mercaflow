import { OrganizationList } from "@clerk/nextjs";

import { requireUser } from "@/lib/data/auth";
import { buildMetadata } from "@/lib/seo/metadata";

// Sélection / création d'organisation. Volontairement HORS du groupe (app) pour ne pas
// hériter de la garde `requireOrg()` — sinon boucle de redirection (pas d'org →
// /select-organization → garde → /select-organization …). Protégée par le middleware
// (route non publique) ; `requireUser()` borne explicitement l'accès aux connectés.
export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "Choisir une organisation",
  description: "Sélectionnez ou créez votre organisation Mercaflow.",
  path: "/select-organization",
  noIndex: true,
});

export default async function SelectOrganizationPage() {
  await requireUser();

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <OrganizationList
        hidePersonal
        afterSelectOrganizationUrl="/dashboard"
        afterCreateOrganizationUrl="/dashboard"
      />
    </main>
  );
}
