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
`;
