/**
 * commitlint — valide les Conventional Commits (CLAUDE.md §2).
 * Types autorisés alignés sur le contrat : feat, fix, refactor, docs, test,
 * chore, perf, ci (+ build, style, revert hérités de config-conventional).
 * Les limites de longueur de corps/pied sont désactivées pour autoriser les
 * URLs et références Linear (ID dans le corps → lien automatique Linear↔GitHub).
 * @type {import("@commitlint/types").UserConfig}
 */
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "body-max-line-length": [0, "always", Infinity],
    "footer-max-line-length": [0, "always", Infinity],
  },
};

export default config;
