/**
 * Les trois thèmes d'Artefacts (source : `src/css/themes.css`, généré avec ces valeurs).
 * Les anciens identifiants hérités de Tadaaa sont ramenés au plus proche.
 */
export type ArtifactTheme = {id: string; label: string; dark: boolean; base: string; ink: string; accent: string};

export const THEMES: ArtifactTheme[] = [
  {id: "affiche", label: "Affiche", dark: false, base: "#f3ede1", ink: "#17130e", accent: "#d7f23f"},
  {id: "nuit", label: "Nuit", dark: true, base: "#120f0b", ink: "#f6efe2", accent: "#d7f23f"},
  {id: "citron", label: "Citron", dark: false, base: "#ffef8a", ink: "#17130e", accent: "#ff4f9a"},
];

export const DEFAULT_THEME = "affiche";

const LEGACY_DARK = new Set(["dark", "dracula", "nord", "synthwave", "terminal", "coraline", "crepuscule"]);

/** Identifiant connu, ou l'équivalent le plus proche (sombre → Nuit, le reste → Affiche). */
export function normalizeTheme(id: string | null | undefined): string {
  const v = (id ?? "").trim();
  if (THEMES.some((t) => t.id === v)) return v;
  return LEGACY_DARK.has(v) ? "nuit" : DEFAULT_THEME;
}

export function isDarkTheme(id: string): boolean {
  return THEMES.find((t) => t.id === id)?.dark ?? false;
}
