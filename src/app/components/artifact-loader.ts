import {LitElement, html, css} from "lit";
import {customElement} from "lit/decorators.js";

/**
 * Attente sans mot : trois formes (rond, carré, triangle) aux couleurs décoratives du thème
 * sautent l'une après l'autre, s'écrasent à l'atterrissage et tournent en l'air ; leur
 * ombre se resserre pendant le saut. N'apparaît qu'après 300 ms (un chargement rapide ne
 * clignote pas). Lecteurs d'écran : `role="status"` + libellé. Mouvement réduit : les
 * formes pulsent sur place.
 */
@customElement("artifact-loader")
export class ArtifactLoader extends LitElement {
  static styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: var(--artifact-loader-height, min(60svh, 22rem));
      padding: 1rem;
      box-sizing: border-box;
      --ink: var(--sc-base-content, #17130e);
      --c1: var(--sc-deco-1, var(--sc-primary, #ff5fa2));
      --c2: var(--sc-deco-2, var(--sc-info, #19d3c5));
      --c3: var(--sc-deco-3, var(--sc-warning, #ffd23f));
    }
    .stage {
      opacity: 0;
      animation: appear 0.3s ease 0.3s forwards;
    }
    svg {
      display: block;
      width: var(--artifact-loader-size, 7.5rem);
      height: auto;
      overflow: visible;
    }
    .hop {
      transform-box: fill-box;
      transform-origin: 50% 100%;
      animation: hop 1.5s cubic-bezier(0.45, 0, 0.55, 1) infinite;
    }
    .spin {
      stroke: var(--ink);
      stroke-width: 2.5;
      stroke-linejoin: round;
      transform-box: fill-box;
      transform-origin: 50% 60%;
      animation: spin 1.5s cubic-bezier(0.45, 0, 0.55, 1) infinite;
    }
    .shadow {
      fill: var(--ink);
      opacity: 0.15;
      transform-box: fill-box;
      transform-origin: 50% 50%;
      animation: shadow 1.5s cubic-bezier(0.45, 0, 0.55, 1) infinite;
    }
    .s1 .spin { fill: var(--c1); }
    .s2 .spin { fill: var(--c2); --spin: 90deg; }
    .s3 .spin { fill: var(--c3); --spin: -360deg; }
    .s2, .s2 .spin, .d2 { animation-delay: 0.18s; }
    .s3, .s3 .spin, .d3 { animation-delay: 0.36s; }

    @keyframes appear {
      to { opacity: 1; }
    }
    /* Accroupi → bond → atterrissage écrasé → rebond. */
    @keyframes hop {
      0%, 62%, 100% { transform: translateY(0) scale(1, 1); }
      8% { transform: translateY(0) scale(1.18, 0.78); }
      14% { transform: translateY(-6px) scale(0.86, 1.16); }
      30% { transform: translateY(-30px) scale(1, 1); }
      44% { transform: translateY(-4px) scale(0.92, 1.1); }
      50% { transform: translateY(0) scale(1.22, 0.76); }
      56% { transform: translateY(0) scale(0.96, 1.05); }
    }
    /* Tour en l'air, posé à plat (carré d'un quart de tour, triangle d'un tour entier). */
    @keyframes spin {
      0%, 14% { transform: rotate(0); }
      44%, 100% { transform: rotate(var(--spin, 0deg)); }
    }
    @keyframes shadow {
      0%, 8%, 50%, 62%, 100% { transform: scale(1); opacity: 0.15; }
      30% { transform: scale(0.45); opacity: 0.06; }
    }
    @media (prefers-reduced-motion: reduce) {
      .hop, .shadow { animation: pulse 1.6s ease-in-out infinite; }
      .spin { animation: none; }
      .s2, .d2 { animation-delay: 0.25s; }
      .s3, .d3 { animation-delay: 0.5s; }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.35; }
      }
    }
  `;

  render() {
    return html`<div class="stage" role="status" aria-label="Chargement">
      <svg viewBox="0 0 120 64" aria-hidden="true" focusable="false">
        <ellipse class="shadow" cx="20" cy="58" rx="13" ry="3" />
        <ellipse class="shadow d2" cx="60" cy="58" rx="13" ry="3" />
        <ellipse class="shadow d3" cx="100" cy="58" rx="13" ry="3" />
        <g class="hop s1"><circle class="spin" cx="20" cy="40" r="13" /></g>
        <g class="hop s2"><rect class="spin" x="47" y="27" width="26" height="26" rx="5" /></g>
        <g class="hop s3"><path class="spin" d="M100 25 L114 53 L86 53 Z" /></g>
      </svg>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "artifact-loader": ArtifactLoader;
  }
}
