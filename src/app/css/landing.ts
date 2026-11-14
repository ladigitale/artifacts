import {css} from "lit";

/**
 * Accueil : une affiche plus qu'un écran. Typographie mêlée (grotesque serrée, sérif italique,
 * lettres de travers), petits repères d'imprimeur, et quelques choses à trouver.
 * Palette et jetons : `art.ts`. Seules les cartes de la vitrine portent la palette de leur artefact.
 */
export const landingStyles = css`
  :host {
    display: block;
    height: 100vh;
    height: 100dvh;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
    font-family: var(--art-display);
  }
  .stage {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  header,
  main,
  footer {
    width: 100%;
    max-width: 76rem;
    margin-inline: auto;
    padding-inline: var(--ui-4);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-4);
    padding-block: var(--ui-4);
    border-bottom: var(--art-edge);
  }
  .edition {
    font-family: var(--art-serif);
    font-style: italic;
    font-size: var(--ui-fs-md);
  }
  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--ui-12);
    padding-block: var(--ui-8) var(--ui-12);
  }

  /* ───── Titre ───── */
  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-12);
    align-items: center;
  }
  .copy {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--ui-6);
    min-width: 0;
  }
  .eyebrow {
    display: flex;
    align-items: center;
    gap: var(--ui-2);
    font-size: var(--ui-fs-sm);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.14em;
  }
  h1 {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    font-size: clamp(3rem, 9.5vw, 6.5rem);
    line-height: 0.92;
    font-weight: 800;
    letter-spacing: -0.045em;
    font-stretch: 85%;
  }
  .w1 {
    text-transform: uppercase;
  }
  .w2 {
    font-size: 1.08em;
    line-height: 0.95;
    margin-inline-start: 0.5em;
    transform: rotate(-3deg);
    transform-origin: left center;
  }
  .w3 {
    display: inline-block;
    margin-top: 0.14em;
    padding: 0.04em 0.16em 0.1em;
    background: var(--art-hot);
    color: var(--art-on-hot);
    font-size: 0.6em;
    letter-spacing: -0.02em;
    transform: rotate(-2.2deg);
    box-shadow: var(--art-hard);
    white-space: nowrap;
  }
  .l {
    display: inline-block;
    transform: translateY(var(--y)) rotate(var(--r));
    transition: transform 0.5s var(--art-spring);
    transition-delay: calc(var(--i) * 12ms);
  }
  .sp {
    display: inline-block;
    width: 0.24em;
  }
  .w3:hover .l {
    transform: none;
  }
  [data-party] .l {
    animation: hop 0.6s var(--art-spring) infinite alternate;
    animation-delay: calc(var(--i) * 45ms);
  }
  @keyframes hop {
    to {
      transform: translateY(-0.28em) rotate(calc(var(--r) * -2));
    }
  }
  .lede {
    max-width: 34rem;
    font-size: var(--ui-fs-lg);
    line-height: 1.5;
    font-weight: 400;
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
  .cta sonic-button[type="primary"] {
    box-shadow: 4px 4px 0 var(--art-ink);
    transition: transform 0.3s var(--art-spring);
  }
  .cta sonic-button[type="primary"]:hover {
    transform: translate(-2px, -2px) rotate(-1.5deg);
  }
  .cta sonic-button[type="primary"]:active {
    transform: translate(3px, 3px);
  }
  .cta .note {
    font-size: var(--ui-fs-sm);
  }
  .cta .note .serif {
    font-size: 1.2em;
  }

  /* ───── Scène vivante ───── */
  .pile {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--ui-2);
    min-width: 0;
  }
  .tag-fig {
    align-self: flex-start;
    font-family: var(--art-serif);
    font-style: italic;
    transform: rotate(1.4deg);
    transform-origin: left bottom;
  }
  .pile-frame {
    background: var(--art-card);
    border: var(--art-edge);
    box-shadow: var(--art-hard);
    transform: rotate(1.4deg);
    overflow: hidden;
  }
  .pile-frame::before,
  .pile-frame::after {
    /* Repères d'imprimeur aux angles. */
    content: "";
    position: absolute;
    z-index: 3;
    width: 14px;
    height: 14px;
    pointer-events: none;
  }
  .pile-frame::before {
    top: 6px;
    left: 6px;
    border-top: 1.5px solid var(--art-ink);
    border-left: 1.5px solid var(--art-ink);
  }
  .pile-frame::after {
    bottom: 6px;
    left: 6px;
    border-bottom: 1.5px solid var(--art-ink);
    border-left: 1.5px solid var(--art-ink);
  }
  .pile-frame artifact-viewer {
    display: block;
  }
  .pile-foot {
    display: flex;
    align-items: flex-start;
    gap: var(--ui-2);
    padding-top: var(--ui-3);
    transform: rotate(1.4deg);
    transform-origin: left top;
  }
  .arrow {
    flex: none;
    width: 3.2rem;
    margin-top: -0.4rem;
  }
  .pile-note {
    max-width: 34ch;
    font-size: var(--ui-fs-sm);
    line-height: 1.45;
  }
  .pile-note .serif {
    font-size: 1.35em;
    line-height: 1.1;
  }
  .stamp {
    position: absolute;
    right: -1.75rem;
    bottom: -0.5rem;
    width: 6.5rem;
    color: var(--art-hot);
    fill: currentColor;
    font-family: var(--art-display);
    font-weight: 700;
    animation: turn 22s linear infinite;
  }
  [data-party] .stamp {
    animation-duration: 1.4s;
  }
  @keyframes turn {
    to {
      transform: rotate(360deg);
    }
  }

  /* ───── Bandeau défilant ───── */
  .ticker {
    width: 100vw;
    margin-inline: calc(50% - 50vw);
    padding-block: var(--ui-3);
    background: var(--art-ink);
    color: var(--art-paper);
    transform: rotate(-1.6deg);
    overflow: hidden;
  }
  .ticker-run {
    display: flex;
    align-items: center;
    gap: var(--ui-6);
    width: max-content;
    font-size: clamp(1.5rem, 4vw, 2.5rem);
    font-weight: 800;
    font-stretch: 85%;
    letter-spacing: -0.02em;
    text-transform: uppercase;
    white-space: nowrap;
    animation: run 34s linear infinite;
  }
  .ticker:hover .ticker-run {
    animation-play-state: paused;
  }
  [data-party] .ticker-run {
    animation-duration: 4s;
    animation-direction: reverse;
  }
  .ticker .serif {
    text-transform: none;
    font-size: 1.25em;
    color: var(--art-sun);
  }
  .ticker .out {
    color: transparent;
    -webkit-text-stroke: 1.5px var(--art-paper);
  }
  .ticker i {
    width: 0.5em;
    height: 0.5em;
    background: var(--art-hot);
    transform: rotate(45deg);
  }
  @keyframes run {
    to {
      transform: translateX(-50%);
    }
  }

  /* ───── Vitrine ───── */
  .showcase {
    display: flex;
    flex-direction: column;
    gap: var(--ui-3);
  }
  .showcase h2 {
    font-size: clamp(2rem, 5vw, 3.25rem);
    line-height: 1;
    font-weight: 800;
    font-stretch: 85%;
    letter-spacing: -0.035em;
    text-transform: uppercase;
  }
  .showcase h2 .serif {
    text-transform: none;
    font-size: 1.12em;
    color: var(--art-hot);
  }
  .showcase h2 .star {
    font-size: 0.5em;
    vertical-align: 0.5em;
  }
  .showcase-lede {
    font-weight: 400;
  }
  .showcase ul {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-6);
    margin-top: var(--ui-4);
  }
  .showcase li {
    position: relative;
  }
  .showcase a {
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: var(--ui-2);
    height: 100%;
    min-height: 20rem;
    padding: var(--ui-6);
    border: var(--art-edge);
    background: var(--card-bg);
    color: var(--card-ink);
    text-decoration: none;
    box-shadow: var(--art-hard);
    transition:
      transform 0.45s var(--art-spring),
      box-shadow 0.45s var(--art-spring);
  }
  .showcase li:nth-child(odd) a {
    transform: rotate(-0.9deg);
  }
  .showcase li:nth-child(even) a {
    transform: rotate(0.8deg);
  }
  .showcase li a:hover {
    transform: rotate(0deg) translate(-3px, -3px);
    box-shadow: 10px 10px 0 var(--art-ink);
  }
  .showcase li a:active {
    transform: rotate(0deg) translate(3px, 3px) scale(0.99);
    box-shadow: 2px 2px 0 var(--art-ink);
  }
  .showcase .cover {
    position: absolute;
    inset: 0 0 auto 0;
    width: 100%;
    height: 56%;
  }
  .showcase a::after {
    content: "";
    position: absolute;
    inset: 54% 0 0 0;
    background: var(--card-bg);
    border-top: 1.5px solid var(--card-ink);
  }
  .showcase a > span,
  .showcase a > strong {
    position: relative;
    z-index: 1;
  }
  .showcase .num {
    position: absolute;
    top: var(--ui-3);
    left: var(--ui-4);
    font-family: var(--art-serif);
    font-style: italic;
    font-size: 2.5rem;
    line-height: 1;
    color: var(--card-ink);
  }
  .showcase .kind {
    align-self: flex-start;
    padding: 0.2em 0.6em;
    background: var(--card-accent);
    color: #14121a;
    font-size: var(--ui-fs-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    transform: rotate(-2deg);
  }
  .showcase strong {
    font-size: clamp(1.75rem, 3vw, 2.4rem);
    line-height: 1;
    font-weight: 800;
    font-stretch: 85%;
    letter-spacing: -0.03em;
  }
  .showcase .blurb {
    max-width: 32ch;
    font-size: var(--ui-fs-sm);
    font-weight: 400;
    line-height: 1.45;
    color: color-mix(in srgb, var(--card-ink) 84%, transparent);
  }
  .showcase .go {
    font-family: var(--art-serif);
    font-style: italic;
    font-size: var(--ui-fs-lg);
  }
  .star-spot {
    position: absolute;
    right: -0.6rem;
    top: -0.9rem;
    z-index: 2;
    font-size: 1.5rem;
  }

  /* ───── Trouvailles ───── */
  .prize {
    align-self: center;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ui-4);
    padding: var(--ui-4) var(--ui-6);
    border: var(--art-edge);
    background: var(--art-sun);
    box-shadow: var(--art-hard);
    transform: rotate(-1.5deg);
    font-size: var(--ui-fs-lg);
    font-weight: 700;
  }
  .prize .serif {
    font-size: 1.4em;
  }
  .hunt {
    position: fixed;
    left: var(--ui-4);
    bottom: var(--ui-4);
    z-index: 5;
    padding: 0.25em 0.7em;
    border: var(--art-edge);
    background: var(--art-card);
    font-size: var(--ui-fs-sm);
    font-weight: 700;
    transform: rotate(-3deg);
    box-shadow: 3px 3px 0 var(--art-ink);
  }

  footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--ui-2) var(--ui-6);
    padding-block: var(--ui-4) var(--ui-6);
    border-top: var(--art-edge);
    font-size: var(--ui-fs-sm);
    font-weight: 400;
  }
  .fine {
    flex-basis: 100%;
    font-size: 0.68rem;
    opacity: 0.7;
  }

  @media (max-width: 959px) {
    .pile {
      margin-bottom: var(--ui-12);
    }
    .stamp {
      width: 4.75rem;
      right: 0.25rem;
      bottom: -4rem;
    }
    .edition {
      display: none;
    }
  }
  @media (min-width: 640px) {
    header,
    main,
    footer {
      padding-inline: var(--ui-6);
    }
    .showcase ul {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
    .showcase li {
      grid-column: span 3;
    }
  }
  @media (min-width: 960px) {
    .hero {
      grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
    }
    .showcase li:nth-child(n + 3) {
      grid-column: span 2;
    }
    .showcase li:nth-child(-n + 2) a {
      min-height: 22rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ticker-run,
    .stamp,
    [data-party] .l {
      animation: none;
    }
    .l,
    .showcase a,
    .cta sonic-button[type="primary"] {
      transition: none;
    }
  }
`;
