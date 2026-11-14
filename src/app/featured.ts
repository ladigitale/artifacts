/**
 * Artefacts mis en avant sur l'accueil. Chacun doit être en visibilité « public » :
 * un artefact « par lien » ou privé n'est pas lisible par un visiteur.
 */
export type FeaturedArtifact = {
  slug: string;
  title: string;
  kind: string;
  blurb: string;
};

export const FEATURED: FeaturedArtifact[] = [
  {
    slug: "abysse-zoom-infini",
    title: "Abysse",
    kind: "Dessin",
    blurb: "Dessin vectoriel à zoom infini : on plonge dans le trait, on exporte en SVG ou en PNG.",
  },
  {
    slug: "contre-cours",
    title: "Contre-cours",
    kind: "Jeu",
    blurb: "Roguelike tramé en cinq encres : un étudiant, un livre, une école à traverser.",
  },
  {
    slug: "resonances-linnstrument",
    title: "Sympath",
    kind: "Instrument",
    blurb: "Synthé à modèles physiques pour LinnStrument : MPE, accords, mélodie aimantée.",
  },
  {
    slug: "solitaire-billes",
    title: "Solitaire",
    kind: "Jeu 3D",
    blurb: "Plateau en bois, billes de marbre, lampe tamisée. Tout se joue au toucher.",
  },
  {
    slug: "theremine-3-octaves-continues",
    title: "Thérémine",
    kind: "Instrument",
    blurb: "Trois octaves continues sous le doigt, timbres, vibrato et réverbe.",
  },
  {
    slug: "pixel-8000",
    title: "Pixel 4000",
    kind: "Dessin",
    blurb: "Une toile de 4000 × 4000 : quatorze pinceaux, tampons, modes de fusion, export PNG.",
  },
];
