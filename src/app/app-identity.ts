import {loadApiBaseUrl, normalizeApiBase} from "./cloud/api-base";

/**
 * Identité d'application d'un artefact ouvert en page (jamais en intégration ni en aperçu) : titre de l'onglet,
 * favicon, icône d'écran d'accueil, couleur du navigateur et manifeste d'installation (PWA). Le document les
 * déclare dans `icon` : `{emoji | text, background, color}` ou `{src: "@asset:icone.png"}` (URL déjà résolue).
 * Le manifeste et l'icône SVG sont servis par l'API Tadaaa (`/api/public/artifacts/{slug}/manifest.webmanifest`,
 * `/icon.svg`) : `start_url` = cette page, avec son jeton de lien.
 */

export type DocIcon = {emoji?: string; text?: string; background?: string; color?: string; src?: string};

const COLOR = /^(#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([0-9.,%\s/deg+-]{1,60}\)|[a-z]{3,24})$/i;

export function readIcon(doc: unknown): DocIcon | null {
  const v = (doc as {icon?: unknown} | null)?.icon;
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const s = (k: string, max: number) => (typeof o[k] === "string" && (o[k] as string).trim() && (o[k] as string).length <= max ? (o[k] as string).trim() : undefined);
  const icon: DocIcon = {emoji: s("emoji", 16), text: s("text", 3), background: s("background", 80), color: s("color", 80), src: s("src", 600)};
  if (icon.background && !COLOR.test(icon.background)) icon.background = undefined;
  if (icon.color && !COLOR.test(icon.color)) icon.color = undefined;
  if (icon.src && !/^https:\/\//.test(icon.src)) icon.src = undefined;
  return icon;
}

const owned: Element[] = [];
let previousTitle: string | null = null;

function head(tag: string, attrs: Record<string, string>): void {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.setAttribute("data-artifact-identity", "");
  document.head.appendChild(el);
  owned.push(el);
}

/** Pose l'identité de l'artefact `slug` (titre, icônes, manifeste) ; `clearAppIdentity` revient à celle d'Artefacts. */
export function applyAppIdentity(slug: string, title: string, doc: unknown, linkToken: string | null): void {
  if (typeof document === "undefined") return;
  clearAppIdentity();
  const icon = readIcon(doc);
  const base = `${normalizeApiBase(loadApiBaseUrl())}/api/public/artifacts/${encodeURIComponent(slug)}`;
  const q = linkToken ? `?k=${encodeURIComponent(linkToken)}` : "";
  previousTitle ??= document.title;
  if (title) document.title = title;
  // Les favicons d'Artefacts restent dans le DOM mais passent après celles de l'artefact.
  document.querySelectorAll('link[rel~="icon"]:not([data-artifact-identity])').forEach((l) => l.setAttribute("data-artifacts-icon", l.getAttribute("rel") ?? "icon"));
  document.querySelectorAll("link[data-artifacts-icon]").forEach((l) => l.setAttribute("rel", "x-icon-off"));
  const iconUrl = icon?.src ?? `${base}/icon.svg${q}`;
  head("link", {rel: "icon", href: iconUrl, ...(icon?.src ? {} : {type: "image/svg+xml"})});
  // iOS ne lit pas de SVG en icône d'écran d'accueil : PNG 180 px rendu ici.
  head("link", {rel: "apple-touch-icon", href: iconUrl});
  void touchIconPng(iconUrl).then((png) => {
    const link = owned.find((el) => el.getAttribute("rel") === "apple-touch-icon");
    if (png && link) link.setAttribute("href", png);
  });
  head("link", {rel: "manifest", href: `${base}/manifest.webmanifest${q}`});
  head("meta", {name: "theme-color", content: icon?.background ?? "#111111"});
  head("meta", {name: "apple-mobile-web-app-title", content: (title || slug).slice(0, 30)});
  head("meta", {name: "apple-mobile-web-app-capable", content: "yes"});
}

export function clearAppIdentity(): void {
  if (typeof document === "undefined") return;
  while (owned.length) owned.pop()!.remove();
  document.querySelectorAll("link[data-artifacts-icon]").forEach((l) => {
    l.setAttribute("rel", l.getAttribute("data-artifacts-icon") ?? "icon");
    l.removeAttribute("data-artifacts-icon");
  });
  if (previousTitle !== null) document.title = previousTitle;
  previousTitle = null;
}

/** PNG 180 × 180 (data:) d'une icône SVG ou image, ou `null` (chargement refusé, canvas indisponible). */
function touchIconPng(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = c.height = 180;
          const ctx = c.getContext("2d");
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, 180, 180);
          resolve(c.toDataURL("image/png"));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}
