import {html, LitElement} from "lit";
import {customElement, state} from "lit/decorators.js";
import "@supersoniks/concorde/button";
import "@supersoniks/concorde/input";
import "@supersoniks/concorde/alert";
import tailwind from "@tailwind";
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
  static styles = [tailwind];

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
    return html`
      <div class="flex flex-col gap-4 max-w-lg">
        <h1 class="text-xl m-0">Compte Tadaaa</h1>
        ${this.info ? html`<sonic-alert status="success">${this.info}</sonic-alert>` : null}
        ${this.error ? html`<sonic-alert status="danger">${this.error}</sonic-alert>` : null}
        <label class="flex flex-col gap-1 text-sm">
          URL API
          <sonic-input
            .value=${this.apiBaseUrl}
            @change=${(e: Event) => {
              const t = e.target as HTMLInputElement;
              this.apiBaseUrl = t.value;
              saveApiBaseUrl(t.value);
            }}
          ></sonic-input>
        </label>
        ${this.account
          ? html`
              <p class="m-0">${this.account.user?.email ?? "Connecté"}</p>
              <sonic-button type="button" @click=${() => this.logout()}>Déconnexion</sonic-button>
              <a class="underline text-sm" href="/admin">Bibliothèque</a>
            `
          : html`
              <sonic-button type="button" ?disabled=${this.busy} @click=${() => this.connectViaTadaaa()}>
                Se connecter avec Tadaaa
              </sonic-button>
            `}
      </div>
    `;
  }
}
