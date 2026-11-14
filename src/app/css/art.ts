import {css} from "lit";

/**
 * Direction artistique de l'accueil et du parcours « Démarrer » : papier chaud, encre,
 * vermillon. Ces deux pages ne suivent pas le thème du compte (elles redéfinissent les
 * jetons `--sc-*` pour leurs composants Concorde) ; l'administration, elle, reste thémée.
 * Net et de travers : aplats, traits fins, ombres franches, aucune couleur floue.
 */
export const artStyles = css`
  :host {
    --art-paper: #f3ede1;
    --art-card: #fffdf7;
    --art-ink: #17130e;
    --art-hot: #e5432a;
    --art-on-hot: #fffdf7;
    --art-moss: #1f5c45;
    --art-sun: #f0b429;
    --art-display: "Bricolage Grotesque", "Arial Narrow", system-ui, sans-serif;
    --art-serif: "Instrument Serif", "Iowan Old Style", Georgia, serif;
    --art-edge: 1.5px solid var(--art-ink);
    --art-hard: 6px 6px 0 var(--art-ink);
    --art-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

    --sc-primary: var(--art-hot);
    --sc-primary-content: var(--art-on-hot);
    --sc-base: var(--art-card);
    --sc-base-50: var(--art-paper);
    --sc-base-content: var(--art-ink);
    --sc-btn-rounded: 4px;

    background: var(--art-paper);
    color: var(--art-ink);
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
    color: var(--art-hot);
    transform: rotate(180deg) scale(1.25);
  }
  @media (prefers-reduced-motion: reduce) {
    .star {
      transition: none;
    }
  }
`;

const FONTS_ID = "art-fonts";

/** Polices d'affichage de ces deux pages (Google Fonts, déjà autorisé par la CSP du viewer). */
export function ensureArtFonts(): void {
  if (document.getElementById(FONTS_ID)) return;
  const link = document.createElement("link");
  link.id = FONTS_ID;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Instrument+Serif:ital@0;1&display=swap";
  document.head.appendChild(link);
}
