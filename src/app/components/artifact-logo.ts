import {LitElement, html, css} from "lit";
import {customElement, property} from "lit/decorators.js";
import {navigate} from "../navigate";

@customElement("artifact-logo")
export class ArtifactLogo extends LitElement {
  static styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      line-height: 1;
      color: inherit;
    }
    a {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      text-decoration: none;
      color: inherit;
    }
    svg {
      width: var(--artifact-logo-size, 2rem);
      height: var(--artifact-logo-size, 2rem);
      display: block;
      flex-shrink: 0;
    }
    .mark-bg {
      fill: var(--sc-primary, #4f1fff);
    }
    .mark-fg {
      fill: none;
      stroke: var(--sc-primary-content, #f8f6ff);
      stroke-width: 7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .wordmark {
      font-family: var(--sc-font-family-headings, "Space Grotesk", system-ui, sans-serif);
      font-weight: 700;
      font-size: var(--artifact-logo-fs, 1.35rem);
      letter-spacing: -0.04em;
      color: var(--sc-base-900, #100e1a);
    }
  `;

  @property({type: Boolean, reflect: true}) wordmark = false;
  @property({type: String}) size = "2rem";
  @property({type: String}) href = "/";

  protected updated(): void {
    this.style.setProperty("--artifact-logo-size", this.size);
  }

  private onClick = (e: Event) => {
    e.preventDefault();
    navigate(this.href);
  };

  protected render() {
    return html`
      <a href=${this.href} aria-label="Artefacts — accueil" @click=${this.onClick}>
        <svg viewBox="0 0 128 128" role="img" aria-hidden="true">
          <rect class="mark-bg" width="128" height="128" rx="28" />
          <rect class="mark-fg" x="30" y="26" width="52" height="76" rx="6" />
          <path class="mark-fg" d="M42 44h28M42 60h28M42 76h18" />
          <path class="mark-fg" d="M82 42h14a8 8 0 0 1 8 8v48a8 8 0 0 1-8 8H54" />
        </svg>
        ${this.wordmark ? html`<span class="wordmark">Artefacts</span>` : null}
      </a>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "artifact-logo": ArtifactLogo;
  }
}
