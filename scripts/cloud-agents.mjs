#!/usr/bin/env node
// Mercaflow — runner Cursor Cloud Agents (MER-34).
//
// Lance une FLOTTE d'agents en parallèle sur le repo via l'API Cursor Cloud Agents
// (1 VM cloud par agent → branche/PR). Pilote depuis nos sessions le pattern
// « chef d'orchestre » : CC orchestre, les Cloud Agents bossent en async.
//
// Le secret CURSOR_API_KEY n'est JAMAIS en clair : il est injecté à l'exécution
// via Infisical et lu dans process.env. Lance toujours via `infisical run` :
//
//   infisical run --env=dev -- node scripts/cloud-agents.mjs --check
//   infisical run --env=dev -- node scripts/cloud-agents.mjs --list
//   infisical run --env=dev -- node scripts/cloud-agents.mjs "MER-42: audit du feed" "MER-43: fix PDP"
//   infisical run --env=dev -- node scripts/cloud-agents.mjs --wait "MER-42: audit du feed"
//
// Options :
//   --check         Valide la clé (GET /v1/me) et l'accès API — à lancer en premier.
//   --list          Liste les agents récents et leur statut.
//   --dry-run       Affiche ce qui serait lancé, sans appeler l'API de création.
//   --wait          Après lancement, attend la fin de chaque agent et affiche la PR.
//   --repo <url>    Repo cible (défaut : $CURSOR_REPO ou GROUP-A26K/mercaflow).
//   --ref <ref>     Branche/commit de départ (défaut : main).
//   --model <id>    Modèle (défaut : $CURSOR_MODEL ou claude-4.6-sonnet-thinking).
//   Tous les autres arguments = un prompt = un agent.
//
// Pré-requis : Node 20+ (fetch natif). Zéro dépendance npm.

const API = process.env.CURSOR_API_URL || "https://api.cursor.com";
const KEY = process.env.CURSOR_API_KEY;
const DEFAULT_REPO =
  process.env.CURSOR_REPO || "https://github.com/GROUP-A26K/mercaflow";
const DEFAULT_MODEL = process.env.CURSOR_MODEL || "claude-4.6-sonnet-thinking";

const POLL_MS = 10000;
const MAX_WAIT_MS = Number(process.env.CURSOR_MAX_WAIT_MS) || 30 * 60 * 1000;

// --- mini parseur d'arguments ------------------------------------------------
function parseArgs(argv) {
  const opts = {
    check: false,
    list: false,
    dryRun: false,
    wait: false,
    repo: DEFAULT_REPO,
    ref: "main",
    model: DEFAULT_MODEL,
    prompts: [],
  };
  // Récupère la valeur d'une option et vérifie qu'elle existe et n'est pas une
  // autre option (sinon `--repo --wait` ferait de "--wait" l'URL du repo).
  const value = (flag, i) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--"))
      fail(`${flag} attend une valeur.`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") opts.check = true;
    else if (a === "--list") opts.list = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--wait") opts.wait = true;
    else if (a === "--repo") opts.repo = value("--repo", i++);
    else if (a === "--ref") opts.ref = value("--ref", i++);
    else if (a === "--model") opts.model = value("--model", i++);
    else if (a.startsWith("--")) fail(`Option inconnue : ${a}`);
    else opts.prompts.push(a);
  }
  return opts;
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

// --- client HTTP -------------------------------------------------------------
// LÈVE une erreur (ne tue PAS le process) : en mode parallèle, l'échec d'un
// agent ne doit pas faire tomber les autres. Le résumé final décide du code de
// sortie. Les commandes mono-appel (--check/--list) sont rattrapées par main().
async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail =
      res.status === 401
        ? "clé API invalide (CURSOR_API_KEY)"
        : res.status === 403
          ? "accès refusé : l'API Cloud Agents exige peut-être un siège Team"
          : res.status === 429
            ? "rate limit atteint, réessaie plus tard"
            : await res.text();
    throw new Error(`HTTP ${res.status} — ${detail}`);
  }
  return res.status === 204 ? null : res.json();
}

// --- commandes ---------------------------------------------------------------
async function cmdCheck() {
  const me = await api("/v1/me");
  console.log(
    `✓ Clé valide (${me.apiKeyName || me.userEmail || "compte OK"}).`,
  );
  // /v1/me ne valide QUE la clé. On exerce vraiment l'API Cloud Agents pour
  // confirmer l'accès (un plan sans le scope agents échouera ici en 403).
  await api("/v1/agents");
  console.log("✓ Accès API Cloud Agents confirmé — tu peux lancer une flotte.");
}

async function cmdList() {
  const data = await api("/v1/agents");
  const agents = Array.isArray(data) ? data : data.agents || [];
  if (!agents.length) return console.log("(aucun agent récent)");
  for (const a of agents) {
    console.log(
      `${a.status || "?"}\t${a.id || a.agentId}\t${a.name || ""}\t${a.prUrl || a.target?.prUrl || ""}`,
    );
  }
}

async function launchOne(prompt, opts) {
  const body = {
    prompt: { text: prompt },
    model: { id: opts.model },
    repos: [{ url: opts.repo, startingRef: opts.ref }],
    autoCreatePR: true,
  };
  const res = await api("/v1/agents", { method: "POST", body });
  const id = res.agentId || res.id;
  // 200 sans identifiant = pas de vrai agent → échec, pas un faux succès.
  if (!id) throw new Error(`réponse sans agentId  «${prompt}»`);
  console.log(`→ lancé : ${id}  «${prompt}»`);
  if (!opts.wait) return { id, prompt };
  return waitFor(id, prompt);
}

async function waitFor(id, prompt) {
  // Poll simple ; backoff fixe pour rester sous les rate limits. Borné par
  // MAX_WAIT_MS pour ne jamais tourner à l'infini si un agent stalle.
  const deadline = Date.now() + MAX_WAIT_MS;
  for (;;) {
    if (Date.now() > deadline) {
      throw new Error(
        `${id} → timeout après ${Math.round(MAX_WAIT_MS / 60000)} min  «${prompt}»`,
      );
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
    const a = await api(`/v1/agents/${id}`);
    const status = a.status || a.state;
    if (["FINISHED", "COMPLETED"].includes(status)) {
      const pr = a.prUrl || a.target?.prUrl || "(pas de PR)";
      console.log(`✓ ${id} → ${status}  ${pr}  «${prompt}»`);
      return { id, prompt, pr };
    }
    // Statut terminal d'échec → LÈVE pour compter l'agent en échec (exit ≠ 0).
    if (
      ["ERROR", "FAILED", "CANCELLED", "STOPPED", "EXPIRED"].includes(status)
    ) {
      throw new Error(`${id} → ${status}  «${prompt}»`);
    }
  }
}

// --- main --------------------------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv.slice(2));

  // dry-run : aucun appel API → utilisable sans clé pour prévisualiser la flotte.
  if (opts.dryRun) {
    if (!opts.prompts.length) fail("Aucune tâche à prévisualiser.");
    console.log(
      `[dry-run] Repo ${opts.repo} @ ${opts.ref} · modèle ${opts.model} · ${opts.prompts.length} agent(s)`,
    );
    opts.prompts.forEach((p, i) =>
      console.log(`  [dry-run] agent ${i + 1} : «${p}»`),
    );
    return;
  }

  if (!KEY) {
    fail(
      "CURSOR_API_KEY absente. Lance via Infisical :\n" +
        "  infisical run --env=dev -- node scripts/cloud-agents.mjs --check",
    );
  }

  if (opts.check) return cmdCheck();
  if (opts.list) return cmdList();

  if (!opts.prompts.length) {
    fail(
      'Aucune tâche. Ex : node scripts/cloud-agents.mjs "MER-42: audit du feed"',
    );
  }

  console.log(
    `Repo ${opts.repo} @ ${opts.ref} · modèle ${opts.model} · ${opts.prompts.length} agent(s)`,
  );

  // Lancement en PARALLÈLE — le cœur de l'orchestration. allSettled isole les
  // échecs : un agent KO n'empêche pas les autres d'aboutir ni d'être résumés.
  const results = await Promise.allSettled(
    opts.prompts.map((p) => launchOne(p, opts)),
  );
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(
        `✗ agent ${i + 1} «${opts.prompts[i]}» : ${r.reason.message}`,
      );
    }
  });
  const ok = results.filter((r) => r.status === "fulfilled").length;
  console.log(`\n${ok}/${results.length} agent(s) OK.`);
  if (ok < results.length) process.exit(1);
}

main().catch((e) => fail(e.message));
