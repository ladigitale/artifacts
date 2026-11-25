import {loadApiBaseUrl, normalizeApiBase} from "./cloud/api-base";

/**
 * Identité d'application d'un artefact ouvert en page (jamais en intégration ni en aperçu) : titre de l'onglet,
 * favicon, icône d'écran d'accueil, couleur du navigateur et manifeste d'installation (PWA). Le document les
 * déclare dans `icon` : `{emoji | text, background, color}` ou `{src: "@asset:icone.png"}` (URL déjà résolue).
 * Le manifeste et l'icône SVG sont servis par l'API Tadaaa (`/api/public/artifacts/{slug}/manifest.webmanifest`,
 * `/icon.svg`) : `start_url` = cette page, avec son jeton de lien.
 *
 * Image de page (`document.image`, `{src, alt}` résolu ou capture `og.png` rendue par l'API) : balises `og:*` et
 * `twitter:*` du document remplacées le temps de l'artefact. Les robots d'aperçu de liens, qui n'exécutent pas
 * le viewer, reçoivent les mêmes balises d'une page de partage de l'API (Caddy, `deploy/cohost/artifacts.caddy`).
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

/** Image de page imposée par le document (`image.src` déjà résolu en https), sinon `null`. */
export function readPageImage(doc: unknown): {src: string; alt?: string} | null {
  const v = (doc as {image?: unknown} | null)?.image;
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.src !== "string" || !/^https:\/\//.test(o.src) || o.src.length > 600) return null;
  return {src: o.src, alt: typeof o.alt === "string" && o.alt.trim() ? o.alt.trim().slice(0, 200) : undefined};
}

const owned: Element[] = [];
/** Balises de partage du site remplacées : contenu d'origine, rendu par `clearAppIdentity`. */
const replaced: {el: Element; content: string | null}[] = [];
let previousTitle: string | null = null;

function head(tag: string, attrs: Record<string, string>): void {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.setAttribute("data-artifact-identity", "");
  document.head.appendChild(el);
  owned.push(el);
}

/** Pose l'identité de l'artefact `slug` (titre, icônes, manifeste) ; `clearAppIdentity` revient à celle d'Artefacts. */
export function applyAppIdentity(slug: string, title: string, doc: unknown, linkToken: string | null, share: {description?: string | null; version?: number} = {}): void {
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
  applyShareMeta(base, title || slug, share, readPageImage(doc), linkToken);
}

function applyShareMeta(base: string, title: string, share: {description?: string | null; version?: number}, image: {src: string; alt?: string} | null, linkToken: string | null): void {
  const q = new URLSearchParams({v: String(share.version ?? 0)});
  if (linkToken) q.set("k", linkToken);
  const src = image?.src ?? `${base}/og.png?${q}`;
  const description = (share.description ?? "").trim();
  const values: [string, string, string | undefined][] = [
    ["property", "og:title", title],
    ["property", "og:description", description || undefined],
    ["property", "og:url", location.href],
    ["property", "og:image", src],
    ["property", "og:image:alt", image?.alt ?? title],
    ["property", "og:image:width", image ? undefined : "1200"],
    ["property", "og:image:height", image ? undefined : "630"],
    ["name", "twitter:title", title],
    ["name", "twitter:description", description || undefined],
    ["name", "twitter:image", src],
    ["name", "description", description || undefined],
  ];
  for (const [attr, key, content] of values) {
    const el = document.head.querySelector(`meta[${attr}="${key}"]:not([data-artifact-identity])`);
    if (el) {
      replaced.push({el, content: el.getAttribute("content")});
      if (content === undefined) el.remove();
      else el.setAttribute("content", content);
    } else if (content !== undefined) head("meta", {[attr]: key, content});
  }
}

export function clearAppIdentity(): void {
  if (typeof document === "undefined") return;
  while (owned.length) owned.pop()!.remove();
  while (replaced.length) {
    const {el, content} = replaced.pop()!;
    if (content !== null) el.setAttribute("content", content);
    if (!el.isConnected) document.head.appendChild(el);
  }
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
