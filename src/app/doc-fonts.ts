/**
 * `fonts` d’un document : familles Google Fonts (noms uniquement, jamais d’URL),
 * chargées dans <head> pour être utilisables dans tout le shadow DOM.
 * Même règle que le validateur API (ArtifactDocumentValidator::FONT_SPEC).
 */
const LINK_ID = "artifact-doc-fonts";
const MAX_FONTS = 4;
const FONT_SPEC =
  /^[A-Z][A-Za-z0-9]*( [A-Z0-9][A-Za-z0-9]*){0,4}(:(ital,)?wght@[0-9;,]{1,40}|:ital@[01;,]{1,10})?$/;

export function applyDocFonts(fonts: unknown): void {
  document.getElementById(LINK_ID)?.remove();
  if (!Array.isArray(fonts)) return;
  const families = fonts
    .filter((f): f is string => typeof f === "string" && f.length <= 80 && FONT_SPEC.test(f))
    .slice(0, MAX_FONTS);
  if (!families.length) return;
  const query = families.map((f) => `family=${f.replace(/ /g, "+")}`).join("&");
  const link = document.createElement("link");
  link.id = LINK_ID;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${query}&display=swap`;
  document.head.appendChild(link);
}
