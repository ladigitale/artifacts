import "@supersoniks/concorde/button";
import "@supersoniks/concorde/icon";
import {html, LitElement} from "lit";
import {customElement, state} from "lit/decorators.js";
import {uiStyles} from "../styles/ui";
import {landingStyles} from "../css/landing";
import {loadArtifactsAccount} from "../cloud/account";
import {cloudReturnUrl, tadaaaLoginUrl} from "../cloud/client";
import {FEATURED} from "../featured";
import {navigate} from "../navigate";
import "./artifact-logo";
import "./artifact-theme-switcher";

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

  protected render() {
    return html`
      <div class="stage">
        <header>
          <artifact-logo wordmark size="2rem" href="/"></artifact-logo>
          <artifact-theme-switcher></artifact-theme-switcher>
        </header>

        <main>
          <section class="copy" aria-labelledby="promise">
            <h1 id="promise">Décrivez une page. Elle est en ligne.</h1>
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

          <section class="demo" aria-hidden="true">
            <div class="pane">
              <span class="pane-title">Conversation</span>
              <p class="bubble me">Un quiz de 5 questions sur les châteaux de la Loire</p>
              <p class="step">Composition du quiz</p>
              <p class="bubble agent">Voici une première version. Je la publie ?</p>
            </div>
            <div class="pane">
              <span class="pane-title">Aperçu</span>
              <div class="quiz">
                <span class="count">Question 1 sur 5</span>
                <p class="q">Quel château enjambe le Cher ?</p>
                <ul>
                  <li>Chambord</li>
                  <li data-on>Chenonceau</li>
                  <li>Azay-le-Rideau</li>
                </ul>
              </div>
              <p class="publish">Publié sur <code>/quiz-chateaux</code></p>
            </div>
          </section>
          <section class="showcase" aria-labelledby="showcase-title">
            <h2 id="showcase-title">À essayer tout de suite</h2>
            <p class="showcase-lede">Tous ont été décrits à un assistant, puis publiés ici. Aucun compte requis.</p>
            <ul>
              ${FEATURED.map(
                (f) => html`
                  <li>
                    <a href=${`/${f.slug}`} data-featured=${f.slug}>
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

        <footer>Artefacts — pages interactives publiées depuis une conversation</footer>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "artifact-landing": ArtifactLanding;
  }
}
