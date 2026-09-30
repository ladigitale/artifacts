import "@supersoniks/concorde/button";
import {html, LitElement} from "lit";
import {customElement, state} from "lit/decorators.js";
import {loadArtifactsAccount} from "../cloud/account";
import {listMyArtifacts, tadaaaLoginUrl, type ArtifactSummary} from "../cloud/client";
import {explainFetchError, loadApiBaseUrl} from "../cloud/api-base";
import tailwind from "../../css/tailwind";

@customElement("artifact-home")
export class ArtifactHome extends LitElement {
  static styles = [tailwind];

  @state() private items: ArtifactSummary[] = [];
  @state() private error = "";
  @state() private loading = true;

  connectedCallback() {
    super.connectedCallback();
    void this.refresh();
  }

  private async refresh() {
    this.loading = true;
    this.error = "";
    const account = loadArtifactsAccount();
    if (!account) {
      this.items = [];
      this.loading = false;
      return;
    }
    try {
      this.items = await listMyArtifacts();
    } catch (e) {
      this.error = explainFetchError(e, loadApiBaseUrl());
      this.items = [];
    } finally {
      this.loading = false;
    }
  }

  private login() {
    const returnTo = `${location.origin}/cloud`;
    location.assign(tadaaaLoginUrl(returnTo));
  }

  render() {
    const account = loadArtifactsAccount();
    return html`
      <div class="flex flex-col gap-6">
        <header class="flex flex-col gap-2">
          <h1 class="text-2xl font-semibold m-0">Artefacts</h1>
          <p class="opacity-80 m-0">
            Documents SDUI Concorde publiés via Tadaaa / MCP.
          </p>
        </header>
        ${!account
          ? html`
              <sonic-button type="button" @click=${() => this.login()}>
                Se connecter avec Tadaaa
              </sonic-button>
            `
          : html`
              <div class="flex items-center gap-3 text-sm opacity-80">
                <span>${account.user?.email ?? "Connecté"}</span>
                <a href="/cloud" class="underline">Compte</a>
              </div>
            `}
        ${this.loading ? html`<p>Chargement…</p>` : null}
        ${this.error ? html`<p class="text-red-600">${this.error}</p>` : null}
        ${account && !this.loading
          ? this.items.length === 0
            ? html`<p class="opacity-70">Aucun artefact pour l’instant. Publiez-en un via MCP.</p>`
            : html`
                <ul class="list-none p-0 m-0 flex flex-col gap-3">
                  ${this.items.map(
                    (a) => html`
                      <li class="border border-current/20 rounded-lg p-3 flex flex-col gap-1">
                        <a class="font-medium underline" href="/${a.slug}/">${a.title}</a>
                        <span class="text-sm opacity-70"
                          >${a.visibility} · v${a.currentVersion} · ${a.updatedAt}</span
                        >
                      </li>
                    `,
                  )}
                </ul>
              `
          : null}
      </div>
    `;
  }
}
