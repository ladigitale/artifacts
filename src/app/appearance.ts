/**
 * Apparence Tadaaa → Artefacts.
 *
 * Sync réelle via compte cloud (`users.theme_id` + GET/PUT /api/appearance),
 * pas le localStorage Tadaaa (origine différente → invisible ici).
 */

import {loadArtifactsAccount, saveArtifactsAccount} from "./cloud/account";
import {loadApiBaseUrl} from "./cloud/api-base";
import {ICONOIR_CDN} from "./icons";

export type AppearanceShell = {
  contentMaxWidth: string;
  menuPosition: "start" | "end" | string;
};

export type AppearanceIcons = {
  library: string;
  path: string;
  defaultPrefix: string;
};

export type AppearancePayload = {
  themeId: string;
  label: string;
  dark: boolean;
  vars: Record<string, string>;
  fontsCssUrl: string | null;
  shell: AppearanceShell;
  icons?: AppearanceIcons;
};

const THEME_KEY = "artifacts-theme";
const LINK_ID = "artifacts-tadaaa-fonts";
const STYLE_ID = "artifacts-appearance-vars";

const DARK_THEMES = new Set([
  "coraline",
  "dark",
  "dracula",
  "nord",
  "synthwave",
  "terminal",
  "crepuscule",
]);

export function loadStoredThemeId(): string {
  try {
    const fromUrl = new URL(location.href).searchParams.get("theme");
    if (fromUrl?.trim()) {
      localStorage.setItem(THEME_KEY, fromUrl.trim());
      return fromUrl.trim();
    }
  } catch {
    /* ignore */
  }
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored?.trim()) return stored.trim();
  } catch {
    /* ignore */
  }
  return "default";
}

export function saveThemeId(id: string): void {
  localStorage.setItem(THEME_KEY, id);
}

export function applyTheme(id: string, dark?: boolean): void {
  const root = document.documentElement;
  const themeId = id || "default";
  if (themeId === "default") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", themeId);
  }
  const isDark = dark ?? DARK_THEMES.has(themeId);
  root.style.colorScheme = isDark ? "dark" : "light";
  clearInlineScVars(root);
  const themeHost = document.querySelector("sonic-theme");
  if (themeHost instanceof HTMLElement) {
    clearInlineScVars(themeHost);
    /* Ne pas laisser Concorde theme=light/dark écraser le thème app */
    themeHost.removeAttribute("theme");
  }
}

function clearInlineScVars(el: HTMLElement): void {
  const style = el.style;
  for (let i = style.length - 1; i >= 0; i--) {
    const name = style.item(i);
    if (name?.startsWith("--sc-")) style.removeProperty(name);
  }
}

function applyFonts(url: string | null): void {
  if (!url || typeof document === "undefined") return;
  let link = document.getElementById(LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = LINK_ID;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  if (link.getAttribute("href") !== url) link.setAttribute("href", url);
}

/** Injecte les vars API sur html + sonic-theme (source de vérité runtime). */
function applyVarsFromApi(themeId: string, vars: Record<string, string>): void {
  let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
  }
  if (!vars || Object.keys(vars).length === 0) {
    styleEl.textContent = "";
    return;
  }
  const decls = Object.entries(vars)
    .filter(([k]) => k.startsWith("--"))
    .map(([k, v]) => `${k}: ${v};`)
    .join("\n  ");

  if (themeId === "default") {
    styleEl.textContent = `
:root,
sonic-theme {
  ${decls}
}
`;
    return;
  }

  styleEl.textContent = `
html[data-theme="${themeId}"],
html[data-theme="${themeId}"] sonic-theme {
  ${decls}
}
`;
}

function applyShell(shell: AppearanceShell | undefined): void {
  if (!shell) return;
  document.documentElement.style.setProperty(
    "--artifacts-content-max-width",
    shell.contentMaxWidth || "72rem",
  );
}

function applyIcons(icons: AppearanceIcons | undefined): void {
  const path = icons?.path || ICONOIR_CDN;
  const prefix = icons?.defaultPrefix || "regular";
  for (const el of [
    document.querySelector("app-router-host"),
    document.querySelector("sonic-scope"),
  ]) {
    if (!(el instanceof HTMLElement)) continue;
    el.setAttribute("customIconLibraryPath", path);
    el.setAttribute("customIconDefaultPrefix", prefix);
  }
}

export function applyAppearance(payload: AppearancePayload): void {
  applyFonts(payload.fontsCssUrl);
  applyTheme(payload.themeId, payload.dark);
  applyVarsFromApi(payload.themeId, payload.vars);
  applyShell(payload.shell);
  applyIcons(payload.icons);
  saveThemeId(payload.themeId);
}

async function fetchAppearance(
  themeId: string | null,
  token?: string | null,
): Promise<AppearancePayload | null> {
  const q =
    themeId && themeId !== ""
      ? `?theme=${encodeURIComponent(themeId)}`
      : "";
  const headers: Record<string, string> = {Accept: "application/json"};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${loadApiBaseUrl()}/api/appearance${q}`, {headers});
  if (!res.ok) return null;
  const payload = (await res.json()) as AppearancePayload;
  return payload?.themeId && payload.vars ? payload : null;
}

/**
 * Résout le thème : ?theme= → compte cloud (JWT) → localStorage → default.
 */
export async function initAppearance(): Promise<void> {
  const urlTheme = (() => {
    try {
      return new URL(location.href).searchParams.get("theme")?.trim() || null;
    } catch {
      return null;
    }
  })();
  if (urlTheme) saveThemeId(urlTheme);

  const account = loadArtifactsAccount();
  const localId = loadStoredThemeId();
  applyTheme(urlTheme || localId);

  try {
    // Avec JWT : sans ?theme= l’API renvoie le thème compte
    const preferAccount = Boolean(account?.token) && !urlTheme;
    const payload = await fetchAppearance(
      preferAccount ? null : urlTheme || localId,
      account?.token,
    );
    if (payload) {
      applyAppearance(payload);
      if (account?.user) {
        account.user = {...account.user, themeId: payload.themeId};
        saveArtifactsAccount(account);
      }
    }
  } catch {
    /* TLS / offline : themes.css + data-theme */
  }
}

/** Re-sync quand on revient sur l’onglet (thème changé dans Tadaaa). */
export function watchAppearanceSync(): void {
  const refresh = () => {
    void initAppearance();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });
  window.addEventListener("focus", refresh);
}
