/**
 * Cadre de page déclaré par le document : `page: {padding, background}`.
 *
 * - `padding` : `none` (plein cadre), `compact`, `normal` (défaut : marge du viewer).
 * - `background` : couleur CSS du fond de la page (hex, rgb/rgba/hsl/hsla, nom, ou var(--sc-…)).
 *   Jamais d'url(), de dégradé ni d'expression : la valeur est écrite telle quelle dans un style.
 * Toute valeur hors de ces formes est ignorée (le viewer garde son cadre habituel).
 */
export type PagePadding = "none" | "compact" | "normal";
export type PageFrame = {padding: PagePadding; background: string};

const PADDINGS: Record<PagePadding, string> = {
  none: "p-0",
  compact: "p-2",
  normal: "p-3 sm:p-4",
};

const COLOR =
  /^(#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([0-9.,%\s/deg+-]{1,60}\)|[a-z]{3,24}|var\(--sc-[a-z0-9-]{1,40}\))$/i;

export function isPageColor(value: unknown): value is string {
  return typeof value === "string" && value.length <= 80 && COLOR.test(value.trim());
}

export function pageFrame(doc: unknown): PageFrame {
  const page = (doc as {page?: unknown} | null)?.page;
  const p = page && typeof page === "object" && !Array.isArray(page) ? (page as Record<string, unknown>) : {};
  const padding = typeof p.padding === "string" && p.padding in PADDINGS ? (p.padding as PagePadding) : "normal";
  const background = isPageColor(p.background) ? p.background.trim() : "";
  return {padding, background};
}

export function paddingClass(padding: PagePadding): string {
  return PADDINGS[padding];
}
