import { NextResponse, type NextRequest } from "next/server";

import { drainAuditJobs } from "@/lib/shopify/audit-jobs";

export const dynamic = "force-dynamic";
// Budget d'exécution (s) : doit couvrir le budget temps mou du worker (~50 s) + une marge.
// ⚠️ Nécessite un plan Vercel autorisant cette durée (sinon la fonction est coupée avant).
export const maxDuration = 60;

// GET /api/shopify/jobs/audit — worker cron de l'audit PUS durable (MER-58).
// Déclenché par Vercel Cron (`vercel.json`), authentifié par `Authorization: Bearer $CRON_SECRET`
// (Vercel envoie ce header automatiquement). Route publique côté Clerk (machine-à-machine, cf.
// proxy.ts). Draine UN job d'audit : audite le catalogue par pages dans un budget temps borné,
// puis relâche le job — le tick suivant reprend au curseur. Idempotent, résistant au crash.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET absent : worker d'audit désactivé");
    return NextResponse.json(
      { error: "Worker non configuré" },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const result = await drainAuditJobs();
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Worker d'audit échoué : ${message}`);
    // 500 → le job reste `running` ; son lease expire → un prochain tick le re-réclame.
    return NextResponse.json({ error: "Worker échoué" }, { status: 500 });
  }
}
