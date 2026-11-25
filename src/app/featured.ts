import {fetchPublicCollection} from "./cloud/client";
import {loadApiBaseUrl, normalizeApiBase} from "./cloud/api-base";

/**
 * Artefacts mis en avant sur l'accueil. Chacun doit être en visibilité « public » :
 * un artefact « par lien » ou privé n'est pas lisible par un visiteur.
 *
 * La sélection se règle dans `/admin/vitrine` (super admin) : elle est rangée dans la collection
 * `vitrine` de l'artefact public `accueil-vitrine` (un seul enregistrement `{items, une}`), lisible
 * sans compte. `FEATURED` sert de sélection par défaut (collection vide ou injoignable) et de
 * bibliothèque d'illustrations : un artefact connu garde son motif dessiné, les autres reçoivent
 * leur icône sur une palette tirée de leur slug.
 *
 * `colors` reprend la palette de l'artefact lui-même (fond, encre, accent) : ce sont des
 * couleurs de contenu, pas des couleurs d'interface, d'où les valeurs en dur.
 */
export type FeaturedMotif =
  | "rings"
  | "dither"
  | "pads"
  | "marbles"
  | "wave"
  | "village"
  | "pool"
  | "chart"
  | "voice"
  | "pumpkin"
  | "brush"
  /** Pas d'illustration dessinée : l'icône de l'artefact (`icon.svg` de l'API) sur sa palette. */
  | "icon";

export type FeaturedArtifact = {
  slug: string;
  title: string;
  kind: string;
  blurb: string;
  motif: FeaturedMotif;
  colors: {bg: string; ink: string; accent: string};
};

export const FEATURED: FeaturedArtifact[] = [
  {
    slug: "abysse-zoom-infini",
    title: "Abysse",
    kind: "Dessin",
    blurb: "Dessin vectoriel à zoom infini : on plonge dans le trait, on exporte en SVG ou en PNG.",
    motif: "rings",
    colors: {bg: "#07263f", ink: "#e8fbff", accent: "#27d3c3"},
  },
  {
    slug: "contre-cours",
    title: "Contre-cours",
    kind: "Jeu",
    blurb: "Roguelike tramé en cinq encres : un étudiant, un livre, une école à traverser.",
    motif: "dither",
    colors: {bg: "#0e0c0d", ink: "#ece6d6", accent: "#d62839"},
  },
  {
    slug: "atelier-scene-3d",
    title: "Atelier de scène 3D",
    kind: "Éditeur 3D",
    blurb: "Un village généré à la demande : on ajoute, déplace et tourne maisons, arbres et personnages au doigt.",
    motif: "village",
    colors: {bg: "#dfe6df", ink: "#1c1c1a", accent: "#c2410c"},
  },
  {
    slug: "resonances-linnstrument",
    title: "Sympath",
    kind: "Instrument",
    blurb: "Synthé à modèles physiques pour LinnStrument : MPE, accords, mélodie aimantée.",
    motif: "pads",
    colors: {bg: "#2a0f4a", ink: "#fff4e6", accent: "#ff8a3d"},
  },
  {
    slug: "billard-3d",
    title: "Billard",
    kind: "Jeu 3D",
    blurb: "Quinze billes, une queue, une ligne de visée : la physique pilote directement la table en 3D.",
    motif: "pool",
    colors: {bg: "#14110f", ink: "#f1e4c8", accent: "#3aa57a"},
  },
  {
    slug: "demo-sonic-plot-saison-des-salles",
    title: "Saison des salles",
    kind: "Données",
    blurb: "Tableau de bord d’une saison de spectacles : graphiques filtrés, carte du territoire et relief 3D.",
    motif: "chart",
    colors: {bg: "#f2ede4", ink: "#1d1f3a", accent: "#ff5c8a"},
  },
  {
    slug: "solitaire-billes",
    title: "Solitaire",
    kind: "Jeu 3D",
    blurb: "Plateau en bois, billes de marbre, lampe tamisée. Tout se joue au toucher.",
    motif: "marbles",
    colors: {bg: "#1f4a3a", ink: "#fdf3d8", accent: "#f2c14e"},
  },
  {
    slug: "cabine-sonore",
    title: "Cabine sonore",
    kind: "Caméra",
    blurb: "La caméra passe dans un shader que la voix déforme et colore ; on exporte le clip avec son beat.",
    motif: "voice",
    colors: {bg: "#13111c", ink: "#ece9f5", accent: "#ff4fd8"},
  },
  {
    slug: "pumpkin-run",
    title: "Pumpkin Run",
    kind: "Jeu",
    blurb: "Une citrouille court dans le cimetière, saute les tombes et file sur un balai. Trois univers, un classement.",
    motif: "pumpkin",
    colors: {bg: "#1d1238", ink: "#f4efff", accent: "#ff8a1f"},
  },
  {
    slug: "pixel-8000",
    title: "Pixel 4000",
    kind: "Peinture",
    blurb: "Toile de 4000 × 4000 : quatorze pinceaux et grains, tampons, modes de fusion, export PNG.",
    motif: "brush",
    colors: {bg: "#f1efe8", ink: "#181425", accent: "#ff5d3a"},
  },
  {
    slug: "theremine-3-octaves-continues",
    title: "Thérémine",
    kind: "Instrument",
    blurb: "Trois octaves continues sous le doigt, timbres, vibrato et réverbe.",
    motif: "wave",
    colors: {bg: "#ff5d73", ink: "#2b0a1a", accent: "#ffe14d"},
  },
];

/** Artefact public qui porte la sélection de l'accueil, et sa collection. */
export const SHOWCASE_SLUG = "accueil-vitrine";
export const SHOWCASE_COLLECTION = "vitrine";
/** Au-delà, la vitrine devient un catalogue : l'admin ne peut pas en choisir plus. */
export const SHOWCASE_MAX = 18;

/** Ce que l'admin règle pour une carte ; le reste (motif, couleurs) vient de `coverOf`. */
export type ShowcaseEntry = {slug: string; title: string; kind: string; blurb: string};
export type Showcase = {items: ShowcaseEntry[]; une: string | null};

const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;
const clip = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Relit un enregistrement venu de l'API : rien d'inattendu ne passe (slug au bon format, textes bornés). */
export function parseShowcase(raw: unknown): Showcase | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as {items?: unknown; une?: unknown};
  if (!Array.isArray(r.items)) return null;
  const seen = new Set<string>();
  const items: ShowcaseEntry[] = [];
  for (const it of r.items) {
    if (!it || typeof it !== "object") continue;
    const e = it as Record<string, unknown>;
    const slug = clip(e.slug, 64);
    if (!SLUG_RE.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    items.push({slug, title: clip(e.title, 60) || slug, kind: clip(e.kind, 24), blurb: clip(e.blurb, 160)});
    if (items.length >= SHOWCASE_MAX) break;
  }
  const une = typeof r.une === "string" && seen.has(r.une) ? r.une : null;
  return {items, une};
}

const KNOWN = new Map(FEATURED.map((f) => [f.slug, f]));
const PALETTES = FEATURED.map((f) => f.colors);

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Illustration d'une carte : motif dessiné s'il est connu, sinon l'icône sur une palette stable. */
export function coverOf(slug: string): {motif: FeaturedMotif; colors: FeaturedArtifact["colors"]} {
  const known = KNOWN.get(slug);
  if (known) return {motif: known.motif, colors: known.colors};
  return {motif: "icon", colors: PALETTES[hash(slug) % PALETTES.length]};
}

export function toFeatured(e: ShowcaseEntry): FeaturedArtifact {
  return {...e, ...coverOf(e.slug)};
}

export function iconUrl(slug: string): string {
  return `${normalizeApiBase(loadApiBaseUrl())}/api/public/artifacts/${encodeURIComponent(slug)}/icon.svg`;
}

/** Sélection par défaut : la liste écrite ici, sans carte à la une. */
export const DEFAULT_SHOWCASE: Showcase = {
  items: FEATURED.map(({slug, title, kind, blurb}) => ({slug, title, kind, blurb})),
  une: null,
};

/** Enregistrement de la collection (id compris, pour le réécrire). */
export type ShowcaseRecord = {id: string; showcase: Showcase};

export function pickShowcaseRecord(records: unknown[]): ShowcaseRecord | null {
  for (const r of records) {
    const rec = r as {id?: unknown; data?: unknown};
    const showcase = parseShowcase(rec?.data);
    if (typeof rec?.id === "string" && showcase) return {id: rec.id, showcase};
  }
  return null;
}

/** Sélection publiée (lecture publique) ; `null` si la collection est vide ou injoignable. */
export async function loadShowcase(): Promise<Showcase | null> {
  try {
    const rec = pickShowcaseRecord(await fetchPublicCollection(SHOWCASE_SLUG, SHOWCASE_COLLECTION));
    return rec && rec.showcase.items.length ? rec.showcase : null;
  } catch {
    return null;
  }
}
