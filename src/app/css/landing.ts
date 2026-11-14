import {css} from "lit";

/**
 * Accueil : une affiche pop. Formes rondes à gros trait, ombres franches, trame de points,
 * hachures, macarons, lettres de travers, et quelques choses à trouver.
 * Couleurs : jetons du thème via `art.ts` (accent, aplats décoratifs). Seules les cartes de la
 * vitrine portent la palette de leur artefact.
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
  }
  .edition {
    padding: 0.15em 0.9em;
    border: var(--art-edge);
    border-radius: 999px;
    background: var(--art-deco-3);
    color: var(--art-on-deco-3);
    font-family: var(--art-serif);
    font-style: italic;
    font-size: var(--ui-fs-md);
    transform: rotate(-1.5deg);
    box-shadow: 3px 3px 0 var(--art-ink);
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
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-12);
    align-items: center;
  }
  .decor {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .decor > * {
    position: absolute;
  }
  .blob {
    border: var(--art-edge);
    border-radius: var(--art-blob);
  }
  .b1 {
    left: -3.5rem;
    top: 7rem;
    width: 11rem;
    height: 10rem;
    background-color: var(--art-deco-1);
    transform: rotate(-14deg);
  }
  .b2 {
    left: 37%;
    bottom: -4.5rem;
    width: 7rem;
    height: 7rem;
    border-radius: 50%;
    background-color: var(--art-deco-2);
  }
  .burst {
    right: -1.5rem;
    top: -2.25rem;
    width: 9rem;
    animation: turn 40s linear infinite;
  }
  .burst path,
  .spark path {
    fill: var(--art-deco-3);
    stroke: var(--art-ink);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
    stroke-linejoin: round;
  }
  .spark {
    width: 2.25rem;
  }
  .spark path {
    fill: var(--art-accent);
  }
  .s1 {
    left: 46%;
    top: 0.5rem;
    animation: pop 2.4s var(--art-spring) infinite alternate;
  }
  .s2 {
    left: 30%;
    bottom: 1rem;
    width: 1.5rem;
    animation: pop 1.9s var(--art-spring) 0.4s infinite alternate;
  }
  .s2 path {
    fill: var(--art-deco-4);
  }
  .ring {
    left: 52%;
    bottom: 22%;
    width: 2.5rem;
    height: 2.5rem;
    border: 6px solid var(--art-deco-4);
    border-radius: 50%;
  }
  @keyframes pop {
    to {
      transform: scale(1.35) rotate(40deg);
    }
  }
  .copy {
    position: relative;
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
    padding: 0.3em 0.9em;
    border: var(--art-edge);
    border-radius: 999px;
    background: var(--art-card);
    font-size: var(--ui-fs-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    transform: rotate(-1deg);
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
    text-shadow: 0.045em 0.045em 0 var(--art-deco-1);
  }
  .w2 {
    position: relative;
    font-size: 1.08em;
    line-height: 0.95;
    margin-inline-start: 0.5em;
    transform: rotate(-3deg);
    transform-origin: left center;
  }
  .w2 .squiggle {
    position: absolute;
    left: 0;
    bottom: -0.08em;
  }
  .w2 .squiggle path {
    stroke: var(--art-deco-2);
  }
  .w3 {
    display: inline-block;
    margin-top: 0.22em;
    padding: 0.08em 0.3em 0.14em;
    background: var(--art-accent);
    color: var(--art-on-accent);
    border: var(--art-edge);
    border-radius: 0.5em 0.9em 0.45em 0.8em / 0.8em 0.5em 0.9em 0.5em;
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
    padding: var(--ui-3) var(--ui-4);
    border: var(--art-edge);
    border-radius: var(--art-round);
    background: var(--art-card);
    font-size: var(--ui-fs-lg);
    line-height: 1.5;
    font-weight: 400;
    box-shadow: 4px 4px 0 var(--art-deco-2);
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
    border-radius: 999px;
    box-shadow: 5px 5px 0 var(--art-deco-1);
    transition: transform 0.3s var(--art-spring);
  }
  .cta sonic-button[type="primary"]:hover {
    transform: translate(-2px, -2px) rotate(-2deg) scale(1.04);
  }
  .cta sonic-button[type="primary"]:active {
    transform: translate(3px, 3px) scale(0.96);
  }
  .macaron {
    width: 5.25rem;
    margin-inline-start: var(--ui-2);
    transform: rotate(12deg);
    transition: transform 0.5s var(--art-spring);
  }
  .macaron:hover {
    transform: rotate(-8deg) scale(1.12);
  }
  .macaron path {
    fill: var(--art-deco-4);
    stroke: var(--art-ink);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
    stroke-linejoin: round;
  }
  .macaron text {
    fill: var(--art-on-deco-4);
    font-family: var(--art-serif);
    font-style: italic;
    font-size: 15px;
  }
  .macaron .big {
    font-family: var(--art-display);
    font-style: normal;
    font-weight: 800;
    font-size: 17px;
    text-transform: uppercase;
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
    padding: 0.1em 0.8em;
    border: var(--art-edge);
    border-radius: 999px;
    background: var(--art-deco-2);
    color: var(--art-on-deco-2);
    font-family: var(--art-serif);
    font-style: italic;
    transform: rotate(-2deg) translateY(0.6rem);
    position: relative;
    z-index: 2;
  }
  .pile-frame {
    background-color: var(--art-card);
    background-image: var(--art-dots);
    background-size: 14px 14px;
    border: var(--art-edge);
    border-radius: calc(var(--art-round) * 1.4);
    box-shadow: 8px 8px 0 var(--art-deco-1);
    transform: rotate(1.4deg);
    overflow: hidden;
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
    color: var(--art-ink);
    fill: currentColor;
    font-family: var(--art-display);
    font-weight: 700;
    animation: turn 22s linear infinite;
  }
  [data-party] .stamp,
  [data-party] .burst {
    animation-duration: 1.4s;
  }
  @keyframes turn {
    to {
      transform: rotate(360deg);
    }
  }

  /* ───── Bandeau défilant, bords en feston ───── */
  .ticker {
    --s: 11px;
    width: 104vw;
    margin-inline: calc(50% - 52vw);
    padding-block: calc(var(--ui-3) + var(--s));
    background: var(--art-ink);
    color: var(--art-paper);
    transform: rotate(-1.6deg);
    overflow: hidden;
    -webkit-mask:
      linear-gradient(#000 0 0) 50% 50% / 100% calc(100% - 2 * var(--s)) no-repeat,
      radial-gradient(var(--s) at 50% var(--s), #000 98%, #0000) 50% 0 / calc(2 * var(--s)) calc(2 * var(--s)) repeat-x,
      radial-gradient(var(--s) at 50% calc(100% - var(--s)), #000 98%, #0000) 50% 100% / calc(2 * var(--s))
        calc(2 * var(--s)) repeat-x;
    mask:
      linear-gradient(#000 0 0) 50% 50% / 100% calc(100% - 2 * var(--s)) no-repeat,
      radial-gradient(var(--s) at 50% var(--s), #000 98%, #0000) 50% 0 / calc(2 * var(--s)) calc(2 * var(--s)) repeat-x,
      radial-gradient(var(--s) at 50% calc(100% - var(--s)), #000 98%, #0000) 50% 100% / calc(2 * var(--s))
        calc(2 * var(--s)) repeat-x;
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
    color: var(--art-accent);
  }
  .ticker .out {
    color: transparent;
    -webkit-text-stroke: 1.5px var(--art-paper);
  }
  .ticker i {
    width: 0.55em;
    height: 0.55em;
    border-radius: var(--art-blob);
    background: var(--art-accent);
  }
  .ticker i[data-c="1"] {
    background: var(--art-deco-1);
  }
  .ticker i[data-c="2"] {
    background: var(--art-deco-2);
  }
  .ticker i[data-c="3"] {
    background: var(--art-deco-3);
  }
  .ticker i[data-c="4"] {
    background: var(--art-deco-4);
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
    border-radius: calc(var(--art-round) * 1.4);
    background: var(--card-bg);
    color: var(--card-ink);
    text-decoration: none;
    box-shadow: 7px 7px 0 var(--card-accent), 7px 7px 0 2px var(--art-ink);
    transition:
      transform 0.45s var(--art-spring),
      box-shadow 0.45s var(--art-spring);
  }
  .showcase li:nth-child(odd) a {
    transform: rotate(-1.2deg);
  }
  .showcase li:nth-child(even) a {
    transform: rotate(1deg);
  }
  .showcase li a:hover {
    transform: rotate(0deg) translate(-4px, -4px) scale(1.015);
    box-shadow: 12px 12px 0 var(--card-accent), 12px 12px 0 2px var(--art-ink);
  }
  .showcase li a:active {
    transform: rotate(0deg) translate(3px, 3px) scale(0.98);
    box-shadow: 2px 2px 0 var(--card-accent), 2px 2px 0 2px var(--art-ink);
  }
  .showcase .cover {
    position: absolute;
    inset: 0 0 auto 0;
    width: 100%;
    height: 56%;
  }
  .showcase a::before {
    /* Trame de points sur l'illustration. */
    content: "";
    position: absolute;
    inset: 0 0 46% 0;
    z-index: 1;
    background-image: radial-gradient(color-mix(in srgb, var(--card-ink) 26%, transparent) 1.2px, transparent 1.6px);
    background-size: 9px 9px;
    mix-blend-mode: overlay;
    pointer-events: none;
  }
  .showcase a::after {
    content: "";
    position: absolute;
    inset: 54% 0 0 0;
    background: var(--card-bg);
    border-top: 2px solid var(--card-ink);
  }
  .showcase a > span,
  .showcase a > strong {
    position: relative;
    z-index: 2;
  }
  .showcase .num {
    position: absolute;
    top: var(--ui-3);
    left: var(--ui-4);
    display: grid;
    place-items: center;
    width: 3.1rem;
    height: 2.9rem;
    border: 2px solid var(--art-ink);
    border-radius: var(--art-blob);
    background: var(--card-accent);
    color: #14121a;
    font-family: var(--art-serif);
    font-style: italic;
    font-size: 1.6rem;
    line-height: 1;
    transform: rotate(-8deg);
  }
  .showcase .kind {
    align-self: flex-start;
    padding: 0.25em 0.8em;
    border: 2px solid var(--art-ink);
    border-radius: 999px;
    background: var(--card-accent);
    color: #14121a;
    font-size: var(--ui-fs-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    transform: rotate(-3deg);
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
    border-radius: var(--art-round);
    background: var(--art-deco-3);
    color: var(--art-on-deco-3);
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
    padding: 0.3em 0.9em;
    border: var(--art-edge);
    border-radius: 999px;
    background: var(--art-accent);
    color: var(--art-on-accent);
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
    border-top: 2px dashed var(--art-ink);
    font-size: var(--ui-fs-sm);
    font-weight: 400;
  }
  .fine {
    flex-basis: 100%;
    font-size: 0.68rem;
    opacity: 0.75;
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
    .edition,
    .b2,
    .ring,
    .s2 {
      display: none;
    }
    .burst {
      width: 5.5rem;
      top: -1.5rem;
      right: -1.75rem;
    }
    .b1 {
      width: 7rem;
      height: 6.5rem;
      top: 4.5rem;
    }
    .macaron {
      width: 4.25rem;
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
    .burst,
    .spark,
    [data-party] .l {
      animation: none;
    }
    .l,
    .macaron,
    .showcase a,
    .cta sonic-button[type="primary"] {
      transition: none;
    }
  }
`;
