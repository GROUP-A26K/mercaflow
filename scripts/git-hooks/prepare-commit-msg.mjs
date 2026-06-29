/**
 * Logique du hook Git `prepare-commit-msg` : injecte l'ID Linear dérivé du nom
 * de branche dans le corps du message de commit (CLAUDE.md §2 — lien automatique
 * Linear↔GitHub). Module pur + entrée CLI ; testé dans
 * `tests/unit/prepare-commit-msg.test.ts`.
 *
 * Convention de branche : `feat|fix|chore|refactor/JB/<TEAM>-<n>-slug`
 * (ex. `chore/JB/MER-9-...` → `MER-9`).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Un ID Linear = préfixe d'équipe alphanumérique commençant par une lettre,
 * tiret, numéro (ex. MER-9, JOS-42). Ancré sur des frontières de mot pour ne
 * pas mordre dans un slug versionné.
 */
const LINEAR_ID_RE = /\b[A-Z][A-Z0-9]+-\d+\b/;

/** Sources de message pour lesquelles on n'injecte rien. */
const SKIP_SOURCES = new Set(["merge", "squash", "commit"]);

/**
 * Extrait l'ID Linear d'un nom de branche, ou `null` s'il n'y en a pas.
 * @param {string | undefined | null} branch
 * @returns {string | null}
 */
export function extractLinearId(branch) {
  if (!branch) return null;
  const match = branch.match(LINEAR_ID_RE);
  return match ? match[0] : null;
}

/**
 * Indique si l'on doit ignorer ce commit selon la source ($2 du hook) :
 * merge / squash / amend (`commit`) ont déjà un message qu'on ne veut pas polluer.
 * @param {string | undefined} source
 * @returns {boolean}
 */
export function shouldSkipSource(source) {
  return source != null && SKIP_SOURCES.has(source);
}

/**
 * Vrai si l'ID apparaît déjà quelque part dans le message (frontières de mot).
 * @param {string} message
 * @param {string} id
 */
function alreadyPresent(message, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(message);
}

/**
 * Injecte l'ID Linear dans le message si la branche en porte un et qu'il n'y
 * est pas déjà. Idempotent. L'ID est placé en pied du contenu humain, séparé
 * par une ligne vide, et avant l'éventuel bloc de commentaires git (`#`).
 * @param {string} message  Contenu actuel du fichier de message
 * @param {string | undefined | null} branch
 * @returns {string}
 */
export function injectLinearId(message, branch) {
  const id = extractLinearId(branch);
  if (!id) return message;
  if (alreadyPresent(message, id)) return message;

  // Normalise les fins de ligne CRLF (Windows / core.autocrlf) pour éviter un
  // mélange \r\n / \n dans la sortie.
  const lines = message.replace(/\r\n/g, "\n").split("\n");
  const commentIdx = lines.findIndex((line) => line.startsWith("#"));
  const splitAt = commentIdx === -1 ? lines.length : commentIdx;

  const content = lines.slice(0, splitAt);
  const rest = lines.slice(splitAt);

  // Retire les lignes vides en fin de contenu pour contrôler la séparation.
  while (content.length > 0 && content[content.length - 1].trim() === "") {
    content.pop();
  }

  content.push("", id);
  if (rest.length > 0) content.push("");

  return [...content, ...rest].join("\n");
}

/**
 * Entrée CLI invoquée par `.husky/prepare-commit-msg`.
 * argv: [msgFilePath, source, sha?]
 * @param {string[]} argv
 * @param {string} branch
 */
export function run(argv, branch) {
  const [msgFile, source] = argv;
  if (!msgFile || shouldSkipSource(source)) return;

  const original = readFileSync(msgFile, "utf8");
  const updated = injectLinearId(original, branch);
  if (updated !== original) writeFileSync(msgFile, updated);
}

// Exécution directe (hook) — pas lors d'un import (tests).
// `pathToFileURL` applique l'encodage des URLs (espaces, non-ASCII) ; une
// concaténation naïve `file://${argv}` casserait la comparaison sur les chemins
// contenant un espace.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  // Un hook ne doit JAMAIS bloquer un commit : toute erreur est avalée (le
  // commit part avec le message inchangé) et on sort en code 0.
  try {
    const { execFileSync } = await import("node:child_process");
    let branch = "";
    try {
      branch = execFileSync("git", ["symbolic-ref", "--short", "HEAD"], {
        encoding: "utf8",
      }).trim();
    } catch {
      // HEAD détachée (rebase, bisect…) : pas de branche → on ne fait rien.
    }
    run(process.argv.slice(2), branch);
  } catch (err) {
    process.stderr.write(`[prepare-commit-msg] erreur ignorée : ${err}\n`);
  }
}
