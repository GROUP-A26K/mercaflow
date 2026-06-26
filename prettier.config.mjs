/**
 * Prettier — formatage du code.
 * Défauts conservés (double quotes, point-virgules, largeur 80, 2 espaces) :
 * alignés sur eslint-config-next et le standard de l'écosystème.
 * Le tri des classes Tailwind v4 se fait via le plugin, qui lit la feuille
 * de style d'entrée (`@import "tailwindcss"`).
 * @type {import("prettier").Config}
 */
const config = {
  plugins: ["prettier-plugin-tailwindcss"],
  tailwindStylesheet: "./app/globals.css",
  tailwindFunctions: ["cn", "cva"],
};

export default config;
