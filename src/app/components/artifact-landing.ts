import "@supersoniks/concorde/button";
import "@supersoniks/concorde/icon";
import "@supersoniks/concorde/badge";
import "@supersoniks/concorde/divider";
import {html, LitElement} from "lit";
import {customElement, state} from "lit/decorators.js";
import tailwind from "../../css/tailwind";
import {landingStyles} from "../css/landing";
import {loadArtifactsAccount} from "../cloud/account";
import {tadaaaLoginUrl} from "../cloud/client";
import {navigate} from "../navigate";
import "./artifact-logo";
import "./artifact-theme-switcher";

@customElement("artifact-landing")
export class ArtifactLanding extends LitElement {
  static styles = [tailwind, landingStyles];

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
          <section class="brand-col">
            <div class="hero-viz" aria-hidden="true"></div>
            <h1 class="brand">Artefacts</h1>
            <p class="lede">
              Documents SDUI Concorde publiés via Tadaaa / MCP — partageables en pleine page.
            </p>
            <div class="meta">
              <sonic-badge type="success" variant="outline" size="sm">
                <sonic-icon slot="prefix" library="custom" name="page" size="xs"></sonic-icon>
                SDUI Concorde
              </sonic-badge>
              <sonic-badge type="info" variant="outline" size="sm">
                <sonic-icon slot="prefix" library="custom" name="share-android" size="xs"></sonic-icon>
                Liens publics
              </sonic-badge>
            </div>
          </section>

          <section class="auth-col" aria-label="Connexion">
            <div class="auth-panel">
              ${this.authed
                ? html`
                    <h2 class="auth-title">Déjà connecté</h2>
                    <p class="auth-lede">Gérez vos artefacts, filtres et partages.</p>
                    <sonic-button type="button" @click=${this.goAdmin}>
                      <sonic-icon slot="prefix" library="custom" name="folder" size="sm"></sonic-icon>
                      Ouvrir la bibliothèque
                    </sonic-button>
                  `
                : html`
                    <h2 class="auth-title">Connexion</h2>
                    <p class="auth-lede">Connectez-vous avec votre compte Tadaaa.</p>
                    <sonic-button type="button" @click=${() => this.login()}>
                      <sonic-icon slot="prefix" library="custom" name="log-in" size="sm"></sonic-icon>
                      Se connecter avec Tadaaa
                    </sonic-button>
                  `}
            </div>
          </section>
        </main>

        <footer>
          <sonic-divider></sonic-divider>
          <p class="mt-3 mb-0">Artefacts — publication SDUI</p>
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
