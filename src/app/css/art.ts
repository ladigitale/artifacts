import {css} from "lit";

/**
 * Mise en page « affiche » de l'accueil et du parcours « Démarrer ». Toutes les couleurs
 * viennent des jetons du thème courant (`--sc-*`), partagés par tout Artefacts : changer de
 * thème change ces pages comme les autres. `--sc-accent` (rehauts) est défini par le thème
 * maison « Affiche » ; les thèmes qui ne l'ont pas retombent sur leur primaire.
 * Net et de travers : aplats, traits fins, ombres franches, aucune couleur floue.
 */
export const artStyles = css`
  :host {
    --art-paper: var(--sc-base-50);
    --art-card: var(--sc-base);
    --art-ink: var(--sc-base-content);
    --art-accent: var(--sc-accent, var(--sc-primary));
    --art-on-accent: var(--sc-accent-content, var(--sc-primary-content));
    --art-display: var(--sc-font-family-headings, system-ui, sans-serif);
    --art-serif: "Instrument Serif", "Iowan Old Style", Georgia, serif;
    --art-edge: 1.5px solid var(--art-ink);
    --art-hard: 6px 6px 0 var(--art-ink);
    --art-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

    background: var(--art-paper);
    color: var(--art-ink);
  }
  /* Rehaut au surligneur : le mot reste à l'encre, l'accent passe derrière. */
  .mark {
    background: linear-gradient(to top, var(--art-accent) 0 42%, transparent 42%);
    padding-inline: 0.08em;
  }
  .serif {
    font-family: var(--art-serif);
    font-style: italic;
    font-weight: 400;
    letter-spacing: 0;
  }
  .star {
    appearance: none;
    display: inline-grid;
    place-items: center;
    width: 1.1em;
    height: 1.1em;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    vertical-align: -0.12em;
    transition: transform 0.5s var(--art-spring);
  }
  .star svg {
    width: 100%;
    height: 100%;
  }
  .star:hover {
    transform: rotate(60deg) scale(1.15);
  }
  .star[data-found] {
    background: var(--art-accent);
    color: var(--art-on-accent);
    border-radius: 50%;
    transform: rotate(180deg) scale(1.25);
  }
  @media (prefers-reduced-motion: reduce) {
    .star {
      transition: none;
    }
  }
`;

const FONTS_ID = "art-fonts";

/** Sérif italique de ces pages, et grotesque du thème maison (Google Fonts, autorisé par la CSP). */
export function ensureArtFonts(): void {
  if (document.getElementById(FONTS_ID)) return;
  const link = document.createElement("link");
  link.id = FONTS_ID;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..800&family=Instrument+Serif:ital@0;1&display=swap";
  document.head.appendChild(link);
}
