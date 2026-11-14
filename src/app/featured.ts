/**
 * Artefacts mis en avant sur l'accueil. Chacun doit être en visibilité « public » :
 * un artefact « par lien » ou privé n'est pas lisible par un visiteur.
 *
 * `colors` reprend la palette de l'artefact lui-même (fond, encre, accent) : ce sont des
 * couleurs de contenu, pas des couleurs d'interface, d'où les valeurs en dur.
 */
export type FeaturedMotif = "rings" | "dither" | "pads" | "marbles" | "wave";

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
    slug: "resonances-linnstrument",
    title: "Sympath",
    kind: "Instrument",
    blurb: "Synthé à modèles physiques pour LinnStrument : MPE, accords, mélodie aimantée.",
    motif: "pads",
    colors: {bg: "#2a0f4a", ink: "#fff4e6", accent: "#ff8a3d"},
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
    slug: "theremine-3-octaves-continues",
    title: "Thérémine",
    kind: "Instrument",
    blurb: "Trois octaves continues sous le doigt, timbres, vibrato et réverbe.",
    motif: "wave",
    colors: {bg: "#ff5d73", ink: "#2b0a1a", accent: "#ffe14d"},
  },
];
