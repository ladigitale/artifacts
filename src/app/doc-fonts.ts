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

/**
 * `fontFiles` d’un document : polices .woff2 fournies en assets (variables comprises). Le serveur a déjà remplacé
 * `@asset:nom.woff2` par l’URL publique de l’asset ; on n’accepte ici que du http(s) sans caractère qui sortirait
 * d’un `url("…")`. Les polices sont ajoutées via l’API FontFace (jamais de CSS construit à la main).
 * Même règles que le validateur API (ArtifactDocumentValidator::validateFontFiles).
 */
const MAX_FONT_FILES = 4;
const FAMILY_SPEC = /^[A-Za-z][A-Za-z0-9 ]{0,39}$/;
const WEIGHT_SPEC = /^[1-9]00( [1-9]00)?$/;
const SAFE_URL = /^https?:\/\/[^\s"'()\\<>]+$/;
const added: FontFace[] = [];

export function applyDocFontFiles(files: unknown): void {
  while (added.length) document.fonts.delete(added.pop() as FontFace);
  if (!Array.isArray(files) || typeof FontFace === "undefined") return;
  for (const f of files.slice(0, MAX_FONT_FILES)) {
    if (!f || typeof f !== "object") continue;
    const {family, src, weight, style} = f as Record<string, unknown>;
    if (typeof family !== "string" || !FAMILY_SPEC.test(family)) continue;
    if (typeof src !== "string" || !SAFE_URL.test(src)) continue; // « @asset:… » non résolu : ignoré
    const descriptors: FontFaceDescriptors = {display: "swap"};
    if (typeof weight === "string" && WEIGHT_SPEC.test(weight)) descriptors.weight = weight;
    if (style === "normal" || style === "italic") descriptors.style = style;
    const face = new FontFace(family, `url("${src}") format("woff2")`, descriptors);
    added.push(face);
    document.fonts.add(face);
    face.load().catch(() => {
      // Police inaccessible (privée, CSP, réseau) : le texte garde la police de repli.
    });
  }
}
