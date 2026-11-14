import {css, html, LitElement} from "lit";
import {customElement} from "lit/decorators.js";
import {tadaaaLegalUrl} from "../cloud/client";

/** Liens légaux (pages servies par Tadaaa) et point de contact pour signaler un contenu. */
@customElement("artifact-legal-links")
export class ArtifactLegalLinks extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    nav {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem 1.25rem;
      font-size: 0.875rem;
    }
    a {
      color: inherit;
      text-decoration-color: color-mix(in srgb, currentColor 40%, transparent);
      text-underline-offset: 0.18em;
    }
    a:hover {
      text-decoration-color: currentColor;
    }
  `;

  protected render() {
    return html`
      <nav aria-label="Informations légales">
        <a href=${tadaaaLegalUrl("mentions")} target="_blank" rel="noopener">Mentions légales</a>
        <a href=${tadaaaLegalUrl("terms")} target="_blank" rel="noopener">CGU</a>
        <a href=${tadaaaLegalUrl("privacy")} target="_blank" rel="noopener">Confidentialité</a>
        <a href=${tadaaaLegalUrl("mentions")} target="_blank" rel="noopener" data-report>Signaler un contenu</a>
      </nav>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "artifact-legal-links": ArtifactLegalLinks;
  }
}
