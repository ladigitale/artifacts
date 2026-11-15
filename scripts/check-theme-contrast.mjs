/**
 * Vérifie les contrastes des thèmes d'Artefacts (src/css/themes.css) : texte, texte atténué
 * (70 %, comme `--ui-muted`), couleurs utilisées en texte, et contenu sur chaque bouton ou aplat.
 * Seuil WCAG AA texte courant : 4,5:1. Code de sortie 1 au moindre échec.
 *
 * Lancer : node scripts/check-theme-contrast.mjs
 */
import fs from "node:fs";

const MIN = 4.5;
const css = fs.readFileSync(new URL("../src/css/themes.css", import.meta.url), "utf8");
const themes = {};
for (const m of css.matchAll(/html\[data-theme="([\w-]+)"\][^{]*\{([^}]*)\}/g)) {
  const vars = Object.fromEntries([...m[2].matchAll(/(--sc-[\w-]+):\s*(#[0-9a-f]{6})/gi)].map((v) => [v[1], v[2]]));
  themes[m[1]] = vars;
}

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = (h) => {
  const [r, g, b] = rgb(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const mix = (a, b, t) =>
  "#" + rgb(a).map((x, i) => Math.round((x * t + rgb(b)[i] * (1 - t)) * 255).toString(16).padStart(2, "0")).join("");

let failures = 0;
for (const [id, v] of Object.entries(themes)) {
  const pairs = [];
  for (const surf of ["--sc-base", "--sc-base-50"]) {
    pairs.push([`texte sur ${surf}`, v["--sc-base-content"], v[surf]]);
    pairs.push([`texte atténué sur ${surf}`, mix(v["--sc-base-content"], v[surf], 0.7), v[surf]]);
    for (const k of ["primary", "info", "success", "danger"]) pairs.push([`${k} en texte sur ${surf}`, v[`--sc-${k}`], v[surf]]);
  }
  for (const k of ["primary", "accent", "info", "success", "warning", "danger"])
    pairs.push([`${k}-content sur ${k}`, v[`--sc-${k}-content`], v[`--sc-${k}`]]);
  for (const i of [1, 2, 3, 4]) pairs.push([`deco-content sur deco-${i}`, v["--sc-deco-content"], v[`--sc-deco-${i}`]]);

  const bad = [];
  let min = Infinity;
  for (const [label, a, b] of pairs) {
    if (!a || !b) {
      bad.push(`${label} : jeton manquant`);
      continue;
    }
    const r = ratio(a, b);
    min = Math.min(min, r);
    if (r < MIN) bad.push(`${label} : ${r.toFixed(2)}`);
  }
  console.log(`${bad.length ? "✘" : "✔"} ${id} — minimum ${min.toFixed(2)}:1${bad.length ? "\n    " + bad.join("\n    ") : ""}`);
  failures += bad.length;
}
process.exit(failures ? 1 : 0);
