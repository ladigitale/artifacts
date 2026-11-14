import {css} from "lit";

/**
 * Page d'accueil — mode « persuader » : une promesse, un geste (se connecter), et la preuve
 * du produit (conversation → aperçu) plutôt qu'un décor. Tout vient des variables du thème.
 */
export const landingStyles = css`
  :host {
    display: block;
    height: 100vh;
    height: 100dvh;
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--sc-base-50);
  }
  .stage {
    min-height: 100%;
    display: flex;
    flex-direction: column;
  }
  header,
  main,
  footer {
    width: 100%;
    max-width: var(--artifacts-content-max-width, 72rem);
    margin-inline: auto;
    padding-inline: var(--ui-4);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-4);
    padding-block: var(--ui-4);
  }
  main {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: center;
    gap: var(--ui-8);
    padding-block: var(--ui-4) var(--ui-8);
  }

  /* ───── Promesse ───── */
  .copy {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--ui-6);
  }
  h1 {
    max-width: 14ch;
    font-size: clamp(2.5rem, 7vw, 4.25rem);
    line-height: 1.02;
    letter-spacing: -0.035em;
    font-weight: 700;
    color: var(--sc-base-900, var(--sc-base-content));
  }
  .lede {
    max-width: 34rem;
    font-size: var(--ui-fs-lg);
    line-height: 1.55;
    color: var(--ui-muted);
  }
  .cta {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--ui-2);
  }
  .cta-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ui-2);
  }
  .cta .note {
    color: var(--ui-muted);
    font-size: var(--ui-fs-sm);
  }
  .kinds {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-1) var(--ui-4);
    color: var(--ui-muted);
    font-size: var(--ui-fs-sm);
  }
  .kinds li + li::before {
    content: "·";
    margin-inline-end: var(--ui-4);
  }

  /* ───── Vitrine : des artefacts publics à ouvrir ───── */
  .showcase {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: var(--ui-3);
    padding-top: var(--ui-8);
  }
  .showcase h2 {
    font-size: var(--ui-fs-2xl);
    letter-spacing: -0.02em;
    font-weight: 700;
  }
  .showcase-lede {
    color: var(--ui-muted);
  }
  .showcase ul {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr));
    gap: var(--ui-3);
    margin-top: var(--ui-2);
  }
  .showcase a {
    display: flex;
    flex-direction: column;
    gap: var(--ui-2);
    height: 100%;
    padding: var(--ui-4);
    background: var(--sc-base);
    border: 1px solid var(--ui-line);
    border-radius: calc(var(--ui-radius) * 1.5);
    text-decoration: none;
    transition:
      border-color 0.2s var(--ui-ease),
      transform 0.2s var(--ui-ease);
  }
  .showcase a:hover {
    border-color: var(--ui-line-strong);
    transform: translateY(-2px);
  }
  .showcase .kind {
    color: var(--ui-muted);
    font-size: var(--ui-fs-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .showcase strong {
    font-family: var(--sc-font-family-headings, inherit);
    font-size: var(--ui-fs-xl);
    line-height: 1.15;
  }
  .showcase .blurb {
    flex: 1;
    color: var(--ui-muted);
    font-size: var(--ui-fs-sm);
    line-height: 1.45;
  }
  .showcase .go {
    font-size: var(--ui-fs-sm);
    font-weight: 600;
  }
  @media (prefers-reduced-motion: reduce) {
    .showcase a {
      transition: none;
    }
    .showcase a:hover {
      transform: none;
    }
  }

  /* ───── Démonstration : le produit, pas un décor ───── */
  .demo {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    background: var(--sc-base);
    border: 1px solid var(--ui-line-strong);
    border-radius: calc(var(--ui-radius) * 1.5);
    box-shadow: var(--ui-shadow-pop);
    overflow: hidden;
    pointer-events: none;
    user-select: none;
  }
  .pane {
    display: flex;
    flex-direction: column;
    gap: var(--ui-3);
    padding: var(--ui-4);
    min-width: 0;
  }
  .pane + .pane {
    border-top: 1px solid var(--ui-line);
    background: var(--sc-base-50);
  }
  .pane-title {
    color: var(--ui-muted);
    font-size: var(--ui-fs-xs);
    font-weight: 600;
  }
  .bubble {
    max-width: 90%;
    padding: var(--ui-2) var(--ui-3);
    border-radius: var(--ui-radius);
    font-size: var(--ui-fs-sm);
    line-height: 1.45;
  }
  .bubble.me {
    align-self: flex-end;
    background: var(--sc-primary);
    color: var(--sc-primary-content);
  }
  .bubble.agent {
    align-self: flex-start;
    background: var(--sc-base-50);
    border: 1px solid var(--ui-line);
  }
  .step {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: var(--ui-2);
    color: var(--ui-muted);
    font-size: var(--ui-fs-xs);
  }
  .step::before {
    content: "";
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--sc-success);
  }
  .quiz {
    display: flex;
    flex-direction: column;
    gap: var(--ui-3);
    padding: var(--ui-4);
    background: var(--sc-base);
    border: 1px solid var(--ui-line);
    border-radius: var(--ui-radius);
  }
  .quiz .count {
    color: var(--ui-muted);
    font-size: var(--ui-fs-xs);
    font-variant-numeric: tabular-nums;
  }
  .quiz .q {
    font-family: var(--sc-font-family-headings, inherit);
    font-size: var(--ui-fs-lg);
    font-weight: 600;
    line-height: 1.25;
    text-wrap: balance;
  }
  .quiz ul {
    display: flex;
    flex-direction: column;
    gap: var(--ui-2);
  }
  .quiz li {
    padding: var(--ui-2) var(--ui-3);
    border: 1px solid var(--ui-line-strong);
    border-radius: var(--ui-radius);
    font-size: var(--ui-fs-sm);
  }
  .quiz li[data-on] {
    background: var(--ui-selected);
    border-color: var(--sc-primary);
    box-shadow: inset 0 0 0 1px var(--sc-primary);
    font-weight: 600;
  }
  .publish {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ui-2);
    font-size: var(--ui-fs-xs);
    color: var(--ui-muted);
  }
  .publish code {
    padding: 0.15em 0.5em;
    border-radius: 0.35em;
    background: var(--sc-base);
    border: 1px solid var(--ui-line);
    color: var(--sc-base-content);
  }

  footer {
    padding-block: var(--ui-4) var(--ui-6);
    color: var(--ui-muted);
    font-size: var(--ui-fs-sm);
  }

  @media (min-width: 640px) {
    header,
    main,
    footer {
      padding-inline: var(--ui-6);
    }
  }
  @media (min-width: 960px) {
    main {
      grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
      gap: var(--ui-12);
      padding-block: var(--ui-6) var(--ui-12);
    }
    .demo {
      grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
    }
    .pane + .pane {
      border-top: 0;
      border-inline-start: 1px solid var(--ui-line);
    }
  }

  /* ───── Couleur et rondeur : l'accueil est une vitrine, pas un écran d'administration ───── */
  :host {
    --pop-coral: #ff5d73;
    --pop-teal: #27d3c3;
    --pop-sun: #ffc94d;
    --pop-orange: #ff8a3d;
    --sc-btn-rounded: 999px;
    background:
      radial-gradient(52rem 34rem at 92% -8%, color-mix(in srgb, var(--pop-coral) 30%, transparent), transparent 62%),
      radial-gradient(46rem 32rem at -12% 18%, color-mix(in srgb, var(--sc-primary) 30%, transparent), transparent 62%),
      radial-gradient(44rem 30rem at 55% 108%, color-mix(in srgb, var(--pop-teal) 28%, transparent), transparent 62%),
      radial-gradient(30rem 22rem at 30% 55%, color-mix(in srgb, var(--pop-sun) 18%, transparent), transparent 65%),
      var(--sc-base-50);
  }
  .hl {
    background: linear-gradient(100deg, var(--sc-primary), var(--pop-coral) 55%, var(--pop-orange));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .stickers {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-2);
  }
  .stickers li {
    padding: 0.3em 0.9em;
    border-radius: 999px;
    font-size: var(--ui-fs-sm);
    font-weight: 700;
    color: #14121a;
  }
  .stickers li:nth-child(odd) {
    transform: rotate(-3deg);
  }
  .stickers li:nth-child(even) {
    transform: rotate(2deg);
  }
  .stickers [data-c="1"] {
    background: var(--pop-sun);
  }
  .stickers [data-c="2"] {
    background: var(--pop-coral);
  }
  .stickers [data-c="3"] {
    background: var(--pop-teal);
  }
  .stickers [data-c="4"] {
    background: var(--pop-orange);
  }
  .stickers [data-c="5"] {
    background: var(--sc-primary);
    color: var(--sc-primary-content);
  }
  .demo {
    border: 0;
    border-radius: 1.75rem;
    transform: rotate(1.2deg);
    box-shadow:
      0 0 0 1px var(--ui-line),
      0 34px 70px -34px color-mix(in srgb, var(--sc-primary) 70%, transparent),
      -18px 26px 60px -40px var(--pop-coral);
  }
  .bubble {
    border-radius: 1.1rem;
  }
  .bubble.me {
    border-bottom-right-radius: 0.3rem;
  }
  .bubble.agent {
    border-bottom-left-radius: 0.3rem;
  }
  .quiz {
    border-radius: 1.25rem;
  }
  .quiz li {
    border-radius: 999px;
    padding-inline: var(--ui-4);
  }
  .quiz li[data-on] {
    background: var(--sc-primary);
    color: var(--sc-primary-content);
  }

  .showcase ul {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-4);
  }
  .showcase a {
    position: relative;
    overflow: hidden;
    justify-content: flex-end;
    min-height: 20rem;
    padding: var(--ui-6);
    border: 0;
    border-radius: 1.75rem;
    background: var(--card-bg);
    color: var(--card-ink);
    box-shadow: 0 24px 50px -30px var(--card-bg);
    transition:
      transform 0.35s var(--ui-ease),
      box-shadow 0.35s var(--ui-ease);
  }
  .showcase li:nth-child(odd) a:hover {
    transform: translateY(-6px) rotate(-1.2deg);
  }
  .showcase li:nth-child(even) a:hover {
    transform: translateY(-6px) rotate(1.2deg);
  }
  .showcase a:hover {
    border-color: transparent;
    box-shadow: 0 34px 60px -28px var(--card-accent);
  }
  .showcase .cover {
    position: absolute;
    inset: 0 0 auto 0;
    width: 100%;
    height: 56%;
    transition: transform 0.6s var(--ui-ease);
  }
  .showcase a:hover .cover {
    transform: scale(1.06);
  }
  .showcase a::after {
    content: "";
    position: absolute;
    inset: 30% 0 0 0;
    background: linear-gradient(to top, var(--card-bg) 62%, transparent);
  }
  .showcase a > span,
  .showcase a > strong {
    position: relative;
    z-index: 1;
  }
  .showcase .kind {
    align-self: flex-start;
    padding: 0.25em 0.8em;
    border-radius: 999px;
    background: var(--card-accent);
    color: #14121a;
    letter-spacing: 0.04em;
  }
  .showcase strong {
    font-size: var(--ui-fs-2xl);
    letter-spacing: -0.02em;
  }
  .showcase .blurb {
    flex: none;
    max-width: 32ch;
    color: color-mix(in srgb, var(--card-ink) 82%, transparent);
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--ui-2) var(--ui-6);
  }
  @media (min-width: 640px) {
    .showcase ul {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
    .showcase li {
      grid-column: span 3;
    }
  }
  @media (min-width: 960px) {
    .showcase li:nth-child(n + 3) {
      grid-column: span 2;
    }
    .showcase li:nth-child(-n + 2) a {
      min-height: 22rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .demo,
    .stickers li {
      transform: none;
    }
    .showcase a,
    .showcase .cover {
      transition: none;
    }
    .showcase li a:hover,
    .showcase a:hover .cover {
      transform: none;
    }
  }
`;
