/**
 * Apparence d'Artefacts : trois thèmes propres (`src/app/themes.ts`, `src/css/themes.css`),
 * indépendants du thème choisi dans Tadaaa. Le choix vit dans ce navigateur (localStorage) ;
 * `?theme=` le remplace pour une visite (lien de démonstration, intégration).
 */

import {ICONOIR_CDN} from "./icons";
import {DEFAULT_THEME, isDarkTheme, normalizeTheme} from "./themes";

export {DEFAULT_THEME};

const THEME_KEY = "artifacts-theme";

export function loadStoredThemeId(): string {
  try {
    const fromUrl = new URL(location.href).searchParams.get("theme");
    if (fromUrl?.trim()) return normalizeTheme(fromUrl);
  } catch {
    /* ignore */
  }
  try {
    return normalizeTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveThemeId(id: string): void {
  try {
    localStorage.setItem(THEME_KEY, normalizeTheme(id));
  } catch {
    /* stockage indisponible */
  }
}

export function applyTheme(id: string): void {
  const root = document.documentElement;
  const themeId = normalizeTheme(id);
  root.setAttribute("data-theme", themeId);
  root.style.colorScheme = isDarkTheme(themeId) ? "dark" : "light";
  const themeHost = document.querySelector("sonic-theme");
  /* Ne pas laisser Concorde theme=light/dark écraser le thème de l'app */
  if (themeHost instanceof HTMLElement) themeHost.removeAttribute("theme");
}

function applyIcons(): void {
  for (const el of [document.querySelector("app-router-host"), document.querySelector("sonic-scope")]) {
    if (!(el instanceof HTMLElement)) continue;
    el.setAttribute("customIconLibraryPath", ICONOIR_CDN);
    el.setAttribute("customIconDefaultPrefix", "regular");
  }
}

/** Applique le thème de ce navigateur (ou celui de `?theme=`). Synchrone : aucun appel réseau. */
export function initAppearance(): void {
  applyTheme(loadStoredThemeId());
  document.documentElement.style.setProperty("--artifacts-content-max-width", "72rem");
  applyIcons();
}

/** Choix explicite de la personne : appliqué et retenu pour ce navigateur. */
export function chooseTheme(id: string): void {
  saveThemeId(id);
  applyTheme(id);
}

/** Un autre onglet d'Artefacts change de thème : on suit. */
export function watchAppearanceSync(): void {
  window.addEventListener("storage", (e) => {
    if (e.key === THEME_KEY) applyTheme(loadStoredThemeId());
  });
}
