/**
 * Artefacts mis en avant sur l'accueil. Chacun doit être en visibilité « public » :
 * un artefact « par lien » ou privé n'est pas lisible par un visiteur.
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
  | "brush";

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
