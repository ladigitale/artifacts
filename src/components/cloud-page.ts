import {css, html, LitElement, nothing} from "lit";
import {customElement, state} from "lit/decorators.js";
import "@supersoniks/concorde/button";
import "@supersoniks/concorde/input";
import "@supersoniks/concorde/icon";
import {navigate} from "../app/navigate";
import {uiStyles} from "../app/styles/ui";
import {
  clearArtifactsAccount,
  loadArtifactsAccount,
  type ArtifactsAccount,
} from "../app/cloud/account";
import {
  explainFetchError,
  loadApiBaseUrl,
  saveApiBaseUrl,
} from "../app/cloud/api-base";
import {exchangeHandoff, tadaaaLoginUrl} from "../app/cloud/client";
import {initAppearance, loadStoredThemeId} from "../app/appearance";

@customElement("cloud-page")
export class CloudPageEl extends LitElement {
  static styles = [
    uiStyles,
    css`
      .who {
        display: flex;
        align-items: center;
        gap: var(--ui-4);
        min-width: 0;
      }
      .who-text {
        min-width: 0;
      }
      .who-text h2 {
        overflow-wrap: anywhere;
      }
      .avatar {
        flex: none;
        display: inline-grid;
        place-items: center;
        width: 3rem;
        height: 3rem;
        border-radius: 50%;
        background: var(--sc-primary);
        color: var(--sc-primary-content);
        font-family: var(--sc-font-family-headings, inherit);
        font-size: var(--ui-fs-lg);
        font-weight: 700;
        text-transform: uppercase;
      }
      .advanced {
        font-size: var(--ui-fs-sm);
      }
      .advanced summary {
        cursor: pointer;
        padding: var(--ui-2) 0;
        color: var(--ui-muted);
        font-weight: 500;
      }
      .advanced .field {
        margin-top: var(--ui-2);
        max-width: 28rem;
      }
    `,
  ];

  @state() account: ArtifactsAccount | null = loadArtifactsAccount();
  @state() error = "";
  @state() info = "";
  @state() busy = false;
  @state() apiBaseUrl = loadApiBaseUrl();

  connectedCallback(): void {
    super.connectedCallback();
    void this.bootstrap();
  }

  private async bootstrap() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("theme")) {
      loadStoredThemeId();
      void initAppearance();
    }
    const handoff = params.get("handoff")?.trim();
    if (handoff) {
      this.busy = true;
      this.error = "";
      const apiBase = loadApiBaseUrl();
      try {
        this.account = await exchangeHandoff(apiBase, handoff);
        this.info = "Connecté via Tadaaa";
        void initAppearance();
        const url = new URL(window.location.href);
        url.searchParams.delete("handoff");
        url.searchParams.delete("theme");
        const next =
          sessionStorage.getItem("artifacts-return-after-login") || "/admin";
        sessionStorage.removeItem("artifacts-return-after-login");
        history.replaceState({}, "", "/cloud");
        if (next !== "/cloud") {
          location.assign(next);
        }
      } catch (e) {
        this.error = explainFetchError(e, apiBase);
      } finally {
        this.busy = false;
      }
      return;
    }
    if (this.account) {
      this.apiBaseUrl = this.account.apiBaseUrl;
      saveApiBaseUrl(this.account.apiBaseUrl);
    }
  }

  private connectViaTadaaa() {
    saveApiBaseUrl(this.apiBaseUrl);
    const returnTo = `${location.origin}/cloud`;
    location.assign(tadaaaLoginUrl(returnTo));
  }

  private logout() {
    clearArtifactsAccount();
    this.account = null;
    this.info = "Déconnecté";
  }

  render() {
    const email = this.account?.user?.email;
    return html`
      <div class="page page-narrow">
        <div class="page-head">
          <div class="titles">
            <h1>Compte</h1>
            <p class="sub">Artefacts utilise votre compte Tadaaa pour stocker et publier vos artefacts.</p>
          </div>
        </div>

        ${this.info
          ? html`<div class="notice" data-tone="success" role="status">
              <sonic-icon library="custom" name="check" size="sm"></sonic-icon>
              <span class="grow">${this.info}</span>
            </div>`
          : nothing}
        ${this.error
          ? html`<div class="notice" data-tone="danger" role="alert">
              <sonic-icon library="custom" name="warning-triangle" size="sm"></sonic-icon>
              <span class="grow">${this.error}</span>
            </div>`
          : nothing}

        <section class="panel panel-pad section" aria-labelledby="session-title" aria-busy=${this.busy}>
          ${this.busy
            ? html`<h2 id="session-title">Connexion en cours…</h2>
                <p class="sub">Un instant, nous récupérons votre session Tadaaa.</p>`
            : this.account
              ? html`
                  <div class="who">
                    <span class="avatar" aria-hidden="true">${(email ?? "?").slice(0, 1)}</span>
                    <div class="who-text">
                      <h2 id="session-title">${email ?? "Connecté"}</h2>
                      <p class="sub">Connecté avec Tadaaa</p>
                    </div>
                  </div>
                  <div class="actions">
                    <sonic-button type="primary" @click=${() => navigate("/admin")}>
                      Ouvrir la bibliothèque
                    </sonic-button>
                    <sonic-button variant="outline" @click=${() => this.logout()}>
                      <sonic-icon slot="prefix" library="custom" name="log-out" size="sm"></sonic-icon>
                      Déconnexion
                    </sonic-button>
                  </div>
                `
              : html`
                  <h2 id="session-title">Vous n’êtes pas connecté</h2>
                  <p class="sub">La connexion se fait sur Tadaaa, puis vous revenez ici.</p>
                  <div class="actions">
                    <sonic-button type="primary" @click=${() => this.connectViaTadaaa()}>
                      <sonic-icon slot="prefix" library="custom" name="log-in" size="sm"></sonic-icon>
                      Se connecter avec Tadaaa
                    </sonic-button>
                  </div>
                `}
        </section>

        <details class="advanced">
          <summary>Paramètres de connexion</summary>
          <label class="field">
            <span class="label">Adresse de l’API Tadaaa</span>
            <sonic-input
              name="api-url"
              .value=${this.apiBaseUrl}
              @change=${(e: Event) => {
                const t = e.target as HTMLInputElement;
                this.apiBaseUrl = t.value;
                saveApiBaseUrl(t.value);
              }}
            ></sonic-input>
            <span class="hint">À modifier seulement si vous utilisez un autre serveur Tadaaa que celui par défaut.</span>
          </label>
        </details>
      </div>
    `;
  }
}
