import "@supersoniks/concorde/button";
import "@supersoniks/concorde/icon";
import {html, LitElement, nothing, svg, type SVGTemplateResult} from "lit";
import {customElement, state} from "lit/decorators.js";
import {uiStyles} from "../styles/ui";
import {artStyles, ensureArtFonts} from "../css/art";
import {landingStyles} from "../css/landing";
import {loadArtifactsAccount} from "../cloud/account";
import {cloudReturnUrl, tadaaaLoginUrl} from "../cloud/client";
import {FEATURED, type FeaturedArtifact} from "../featured";
import {LANDING_HERO_DOC} from "../landing-hero";
import {navigate} from "../navigate";
import "./artifact-logo";
import "./artifact-legal-links";
import "./artifact-theme-switcher";
import "./artifact-viewer";

const STARS = 5;
const SECRET = "tadaaa";
const TICKER = ["quiz", "jeu", "instrument", "carte", "dessin", "sondage", "synthé", "histoire", "simulateur"];
/** Rotation (°) et décalage vertical (em) de chaque lettre du titre : écrit une fois, pas tiré au sort. */
/** Étoile à pointes (macaron) : n pointes entre deux rayons, centrée dans un carré de 100. */
function burst(n: number, r1: number, r2: number): string {
  return (
    Array.from({length: n * 2}, (_, i) => {
      const r = i % 2 ? r2 : r1;
      const a = (Math.PI * i) / n - Math.PI / 2;
      return `${i ? "L" : "M"}${(50 + r * Math.cos(a)).toFixed(1)} ${(50 + r * Math.sin(a)).toFixed(1)}`;
    }).join("") + "Z"
  );
}
const SQUIGGLE = "M2 8 Q 14 -4 26 8 T 50 8 T 74 8 T 98 8";

const WOBBLE: [number, number][] = [[-4, 0.02], [3, -0.03], [-2, 0.04], [5, 0], [-3, -0.02], [2, 0.03], [-5, 0.01], [4, -0.04]];

@customElement("artifact-landing")
export class ArtifactLanding extends LitElement {
  static styles = [uiStyles, artStyles, landingStyles];

  @state() private authed = !!loadArtifactsAccount();
  /** Astérisques trouvés (chasse discrète : cinq sont cachés dans la page). */
  @state() private found = new Set<number>();
  @state() private party = false;

  private typed = "";
  private partyTimer: ReturnType<typeof setTimeout> | undefined;

  connectedCallback(): void {
    super.connectedCallback();
    this.authed = !!loadArtifactsAccount();
    ensureArtFonts();
    window.addEventListener("keydown", this.onKey);
  }

  disconnectedCallback(): void {
    window.removeEventListener("keydown", this.onKey);
    clearTimeout(this.partyTimer);
    super.disconnectedCallback();
  }

  /** Taper « tadaaa » n'importe où : la page s'agite quelques secondes. */
  private onKey = (e: KeyboardEvent) => {
    if (e.key.length !== 1) return;
    this.typed = (this.typed + e.key.toLowerCase()).slice(-SECRET.length);
    if (this.typed !== SECRET) return;
    this.party = true;
    clearTimeout(this.partyTimer);
    this.partyTimer = setTimeout(() => (this.party = false), 4200);
  };

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

  private find(i: number, e: Event) {
    e.preventDefault();
    e.stopPropagation();
    if (this.found.has(i)) return;
    this.found = new Set([...this.found, i]);
  }

  private star(i: number) {
    const done = this.found.has(i);
    return html`<button
      class="star"
      type="button"
      data-star=${i}
      ?data-found=${done}
      aria-label=${done ? "Astérisque trouvé" : "Un astérisque"}
      @click=${(e: Event) => this.find(i, e)}
    >
      ${svg`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="square"/></svg>`}
    </button>`;
  }

  private letters(text: string) {
    let k = 0;
    return [...text].map((ch) => {
      if (ch === " ") return html`<span class="sp"> </span>`;
      const [r, y] = WOBBLE[k++ % WOBBLE.length];
      return html`<span class="l" style=${`--r:${r}deg;--y:${y}em;--i:${k}`}>${ch}</span>`;
    });
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
    const all = this.found.size === STARS;
    return html`
      <div class="stage" ?data-party=${this.party}>
        <header>
          <artifact-logo wordmark size="2rem" href="/"></artifact-logo>
          <span class="edition">éd. n° 1 · faite main avec des prompts</span>
          <artifact-theme-switcher></artifact-theme-switcher>
        </header>

        <main>
          <section class="hero" aria-labelledby="promise">
            <div class="decor" aria-hidden="true">
              <span class="blob b1"></span>
              <span class="blob b2 hatch"></span>
              <svg class="burst b3" viewBox="0 0 100 100"><path d=${burst(14, 48, 36)} /></svg>
              <svg class="spark s1" viewBox="0 0 100 100"><path d=${burst(4, 48, 12)} /></svg>
              <svg class="spark s2" viewBox="0 0 100 100"><path d=${burst(4, 48, 12)} /></svg>
              <span class="ring"></span>
            </div>
            <div class="copy">
              <p class="eyebrow">${this.star(0)} pages interactives, publiées depuis une conversation</p>
              <h1 id="promise" aria-label="Décrivez une page. Elle est en ligne.">
                <span class="w1" aria-hidden="true">Décrivez</span>
                <span class="w2 serif" aria-hidden="true"
                  >une page.<svg class="squiggle" viewBox="0 0 100 16" preserveAspectRatio="none"><path d=${SQUIGGLE} /></svg></span
                >
                <span class="w3" aria-hidden="true">${this.letters("Elle est en ligne.")}</span>
              </h1>
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
                          Se connecter
                        </sonic-button>
                        <svg class="macaron" viewBox="0 0 100 100" aria-hidden="true">
                          <path d=${burst(12, 48, 39)} />
                          <text x="50" y="47" text-anchor="middle">c’est</text>
                          <text x="50" y="63" text-anchor="middle" class="big">gratuit</text>
                        </svg>
                      </div>
                      <p class="note">Compte gratuit, <span class="serif mark">trois étapes guidées,</span> cinq minutes.</p>
                    `}
              </div>
            </div>

            <div class="pile">
              <span class="tag-fig">fig. 1 — une pile de mots</span>
              <div class="pile-frame">
                <artifact-viewer embedded slug="accueil" .previewDocument=${LANDING_HERO_DOC}></artifact-viewer>
              </div>
              <div class="pile-foot">
                <svg class="arrow" viewBox="0 0 80 60" aria-hidden="true">
                  <path d="M74 54C52 56 22 44 14 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  <path d="M4 22 14 10l10 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <p class="pile-note">
                  <span class="serif">Attrapez un mot, lancez-le.</span> Cette scène est un artefact : de la
                  physique, du HTML, du son, zéro ligne de JavaScript. ${this.star(1)}
                </p>
              </div>
              <svg class="stamp" viewBox="0 0 120 120" aria-hidden="true">
                <defs><path id="rond" d="M60 60m-44 0a44 44 0 1 1 88 0a44 44 0 1 1-88 0" /></defs>
                <circle cx="60" cy="60" r="57" fill="none" stroke="currentColor" stroke-width="1.5" />
                <text font-size="11.5" letter-spacing="2.6"><textPath href="#rond">DÉCRIT · PUBLIÉ · PARTAGÉ · DÉCRIT · PUBLIÉ · PARTAGÉ ·</textPath></text>
                <path d="M60 40v40M42.7 50l34.6 20M42.7 70l34.6-20" fill="none" stroke="currentColor" stroke-width="5" />
              </svg>
            </div>
          </section>

          <div class="ticker" aria-hidden="true">
            <div class="ticker-run">
              ${[0, 1].map(
                () => html`${TICKER.map((w, i) => html`<span class=${i % 3 === 1 ? "serif" : i % 3 === 2 ? "out" : ""}>${w}</span><i data-c=${(i % 4) + 1}></i>`)}`,
              )}
            </div>
          </div>

          <section class="showcase" aria-labelledby="showcase-title">
            <h2 id="showcase-title">À essayer <span class="serif mark">tout de suite</span> ${this.star(2)}</h2>
            <p class="showcase-lede">Tous ont été décrits à un assistant, puis publiés ici. Aucun compte requis.</p>
            <ul>
              ${FEATURED.map(
                (f, i) => html`
                  <li>
                    <a
                      href=${`/${f.slug}`}
                      data-featured=${f.slug}
                      style=${`--card-bg:${f.colors.bg};--card-ink:${f.colors.ink};--card-accent:${f.colors.accent}`}
                    >
                      ${this.cover(f)}
                      <span class="num" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>
                      <span class="kind">${f.kind}</span>
                      <strong>${f.title}</strong>
                      <span class="blurb">${f.blurb}</span>
                      <span class="go" aria-hidden="true">Ouvrir →</span>
                    </a>
                    ${i === 4 ? html`<span class="star-spot">${this.star(3)}</span>` : nothing}
                  </li>
                `,
              )}
            </ul>
          </section>

          ${all
            ? html`<section class="prize" role="status">
                <p><span class="serif">Vous avez l’œil.</span> Les cinq y sont.</p>
                <sonic-button type="primary" @click=${this.goStart}>Alors faites le vôtre</sonic-button>
              </section>`
            : nothing}
        </main>

        <footer>
          <span>Artefacts — pages interactives publiées depuis une conversation</span>
          <artifact-legal-links></artifact-legal-links>
          <p class="fine">
            Petites lignes : aucun pixel n’a été maltraité. Essayez le bouton ↕ de la pile, ou tapez
            « tadaaa ». ${this.star(4)}
          </p>
        </footer>

        ${this.found.size > 0 && !all
          ? html`<p class="hunt" role="status">${this.found.size} / ${STARS} astérisques</p>`
          : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "artifact-landing": ArtifactLanding;
  }
}
