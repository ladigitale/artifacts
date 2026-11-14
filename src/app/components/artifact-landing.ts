import "@supersoniks/concorde/button";
import "@supersoniks/concorde/icon";
import {html, LitElement, svg, type SVGTemplateResult} from "lit";
import {customElement, state} from "lit/decorators.js";
import {uiStyles} from "../styles/ui";
import {landingStyles} from "../css/landing";
import {loadArtifactsAccount} from "../cloud/account";
import {cloudReturnUrl, tadaaaLoginUrl} from "../cloud/client";
import {FEATURED, type FeaturedArtifact} from "../featured";
import {navigate} from "../navigate";
import "./artifact-logo";
import "./artifact-theme-switcher";
import "./artifact-legal-links";
import "./artifact-viewer";
import {LANDING_HERO_DOC} from "../landing-hero";

@customElement("artifact-landing")
export class ArtifactLanding extends LitElement {
  static styles = [uiStyles, landingStyles];

  @state() private authed = !!loadArtifactsAccount();

  connectedCallback(): void {
    super.connectedCallback();
    this.authed = !!loadArtifactsAccount();
  }

  private login() {
    location.assign(tadaaaLoginUrl(cloudReturnUrl("/admin")));
  }

  private goStart = (e: Event) => {
    e.preventDefault();
    navigate("/demarrer");
  };

  private goAdmin(e: Event) {
    e.preventDefault();
    navigate("/admin");
  }

  /** Illustration de carte, dessinée dans la palette de l'artefact (pas une capture d'écran). */
  private cover(f: FeaturedArtifact): SVGTemplateResult {
    const {ink, accent} = f.colors;
    const body = (() => {
      switch (f.motif) {
        case "rings":
          return svg`${[12, 26, 42, 60, 80, 102, 126].map(
            (r, i) => svg`<circle cx="138" cy="52" r=${r} fill="none" stroke=${accent} stroke-width=${3 - i * 0.3} opacity=${1 - i * 0.12} />`,
          )}<path d="M20 118 C60 60 86 132 124 74 S168 40 186 22" fill="none" stroke=${ink} stroke-width="3.5" stroke-linecap="round" />`;
        case "dither":
          return svg`<defs><pattern id="trame" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill=${accent} /><rect x="4" y="4" width="4" height="4" fill=${accent} /></pattern></defs>
            <rect x="96" y="0" width="104" height="140" fill="url(#trame)" />
            <rect x="120" y="36" width="44" height="56" fill=${ink} /><rect x="120" y="36" width="8" height="56" fill="#2b4cc0" />
            <rect x="136" y="50" width="20" height="4" fill="#0e0c0d" /><rect x="136" y="60" width="14" height="4" fill="#0e0c0d" />
            <rect x="64" y="100" width="16" height="16" fill="#2e9e4f" /><rect x="40" y="20" width="8" height="8" fill=${ink} />`;
        case "pads":
          return svg`${Array.from({length: 32}, (_, i) => {
            const x = i % 8;
            const y = Math.floor(i / 8);
            const on = [3, 5, 10, 12, 14, 19, 21, 28].includes(i);
            return svg`<rect x=${24 + x * 21} y=${24 + y * 21} width="16" height="16" rx="4" fill=${on ? ink : accent} opacity=${on ? 1 : 0.25 + ((i * 7) % 5) * 0.14} />`;
          })}`;
        case "marbles":
          return svg`<defs><radialGradient id="bille" cx="35%" cy="30%"><stop offset="0" stop-color=${ink} /><stop offset="0.5" stop-color=${accent} /><stop offset="1" stop-color="#8a5a12" /></radialGradient></defs>
            ${Array.from({length: 49}, (_, i) => {
              const x = i % 7;
              const y = Math.floor(i / 7);
              const inside = (x > 1 && x < 5) || (y > 1 && y < 5);
              if (!inside) return svg``;
              const empty = i === 24;
              return svg`<circle cx=${84 + x * 17} cy=${16 + y * 17} r="6.5" fill=${empty ? "none" : "url(#bille)"} stroke=${empty ? accent : "none"} stroke-width="1.5" />`;
            })}`;
        case "wave":
          return svg`${[0, 1, 2].map(
            (i) => svg`<path d=${`M-10 ${50 + i * 22} C 30 ${10 + i * 22}, 50 ${90 + i * 22}, 90 ${50 + i * 22} S 150 ${10 + i * 22}, 210 ${50 + i * 22}`} fill="none" stroke=${i === 1 ? accent : ink} stroke-width=${i === 1 ? 9 : 4} stroke-linecap="round" opacity=${i === 1 ? 1 : 0.7} />`,
          )}`;
      }
    })();
    return svg`<svg class="cover" viewBox="0 0 200 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${body}</svg>`;
  }

  protected render() {
    return html`
      <div class="stage">
        <header>
          <artifact-logo wordmark size="2rem" href="/"></artifact-logo>
          <artifact-theme-switcher></artifact-theme-switcher>
        </header>

        <main>
          <section class="copy" aria-labelledby="promise">
            <h1 id="promise">Décrivez une page. <span class="hl">Elle est en ligne.</span></h1>
            <p class="lede">
              Dites à votre assistant ce que vous voulez : un quiz, un jeu, un instrument, une
              visualisation. Il publie la page ; vous partagez le lien ou vous l’intégrez sur votre site.
            </p>
            <div class="cta">
              ${this.authed
                ? html`
                    <sonic-button type="primary" size="lg" @click=${this.goAdmin}>
                      <sonic-icon slot="prefix" library="custom" name="folder" size="sm"></sonic-icon>
                      Ouvrir la bibliothèque
                    </sonic-button>
                    <p class="note">Vous êtes déjà connecté.</p>
                  `
                : html`
                    <div class="cta-row">
                      <sonic-button type="primary" size="lg" data-cta="start" @click=${this.goStart}>
                        Commencer
                      </sonic-button>
                      <sonic-button type="default" variant="ghost" size="lg" @click=${() => this.login()}>
                        <sonic-icon slot="prefix" library="custom" name="log-in" size="sm"></sonic-icon>
                        Se connecter
                      </sonic-button>
                    </div>
                    <p class="note">Compte gratuit, trois étapes guidées, cinq minutes.</p>
                  `}
            </div>
          </section>

          <section class="pile" aria-label="Scène interactive">
            <div class="pile-frame">
              <artifact-viewer embedded slug="accueil" .previewDocument=${LANDING_HERO_DOC}></artifact-viewer>
            </div>
            <p class="pile-note">
              Attrapez un mot, lancez-le. Cette scène est un artefact : de la physique, des éléments
              HTML, du son, et aucune ligne de JavaScript.
            </p>
          </section>
          <section class="showcase" aria-labelledby="showcase-title">
            <h2 id="showcase-title">À essayer tout de suite</h2>
            <p class="showcase-lede">Tous ont été décrits à un assistant, puis publiés ici. Aucun compte requis.</p>
            <ul>
              ${FEATURED.map(
                (f) => html`
                  <li>
                    <a
                      href=${`/${f.slug}`}
                      data-featured=${f.slug}
                      style=${`--card-bg:${f.colors.bg};--card-ink:${f.colors.ink};--card-accent:${f.colors.accent}`}
                    >
                      ${this.cover(f)}
                      <span class="kind">${f.kind}</span>
                      <strong>${f.title}</strong>
                      <span class="blurb">${f.blurb}</span>
                      <span class="go" aria-hidden="true">Ouvrir →</span>
                    </a>
                  </li>
                `,
              )}
            </ul>
          </section>
        </main>

        <footer>
          <span>Artefacts — pages interactives publiées depuis une conversation</span>
          <artifact-legal-links></artifact-legal-links>
        </footer>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "artifact-landing": ArtifactLanding;
  }
}
