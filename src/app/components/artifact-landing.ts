import "@supersoniks/concorde/button";
import "@supersoniks/concorde/icon";
import {html, LitElement} from "lit";
import {customElement, state} from "lit/decorators.js";
import {uiStyles} from "../styles/ui";
import {landingStyles} from "../css/landing";
import {loadArtifactsAccount} from "../cloud/account";
import {tadaaaLoginUrl} from "../cloud/client";
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
    sessionStorage.setItem("artifacts-return-after-login", "/admin");
    const returnTo = `${location.origin}/cloud`;
    location.assign(tadaaaLoginUrl(returnTo));
  }

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
              Dites à l’atelier ce que vous voulez : un quiz, un sondage, un jeu, une visualisation. Vous
              ajustez l’aperçu, puis vous partagez le lien ou vous l’intégrez sur votre site.
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
                    <sonic-button type="primary" size="lg" @click=${() => this.login()}>
                      <sonic-icon slot="prefix" library="custom" name="log-in" size="sm"></sonic-icon>
                      Se connecter avec Tadaaa
                    </sonic-button>
                    <p class="note">Artefacts utilise votre compte Tadaaa.</p>
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
