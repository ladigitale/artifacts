import {html, LitElement} from "lit";
import {customElement, property, state} from "lit/decorators.js";
import {listVersions, restoreVersion} from "../cloud/client";
import {loadArtifactsAccount} from "../cloud/account";
import {explainFetchError, loadApiBaseUrl} from "../cloud/api-base";
import {navigate} from "../navigate";
import "@supersoniks/concorde/button";
import tailwind from "../../css/tailwind";

@customElement("artifact-versions-page")
export class ArtifactVersionsPage extends LitElement {
  static styles = [tailwind];
  @property({type: String}) slug = "";
  @state() private rows: {version: number; createdAt: string; note?: string | null; current: boolean}[] =
    [];
  @state() private error = "";
  @state() private busy = false;

  connectedCallback() {
    super.connectedCallback();
    void this.load();
  }

  private async load() {
    if (!loadArtifactsAccount()) {
      this.error = "Connectez-vous pour gérer les versions.";
      return;
    }
    try {
      this.rows = await listVersions(this.slug);
    } catch (e) {
      this.error = explainFetchError(e, loadApiBaseUrl());
    }
  }

  private async restore(n: number) {
    this.busy = true;
    try {
      await restoreVersion(this.slug, n);
      await this.load();
    } catch (e) {
      this.error = explainFetchError(e, loadApiBaseUrl());
    } finally {
      this.busy = false;
    }
  }

  render() {
    return html`
      <div class="flex flex-col gap-4">
        <div class="flex flex-wrap gap-3 items-center">
          <sonic-button type="button" size="sm" variant="ghost" @click=${() => navigate("/admin")}>
            ← Bibliothèque
          </sonic-button>
          <sonic-button
            type="button"
            size="sm"
            variant="outline"
            @click=${() => window.open(`/${this.slug}/`, "_blank", "noopener,noreferrer")}
          >
            Ouvrir l’artefact
          </sonic-button>
        </div>
        <h1 class="text-xl m-0">Versions — ${this.slug}</h1>
        ${this.error ? html`<p class="text-red-600">${this.error}</p>` : null}
        <ul class="list-none p-0 m-0 flex flex-col gap-2">
          ${this.rows.map(
            (r) => html`
              <li class="flex items-center gap-3 border border-current/15 rounded p-2">
                <span>v${r.version}${r.current ? " (courante)" : ""}</span>
                <span class="text-sm opacity-70 flex-1"
                  >${r.createdAt}${r.note ? ` — ${r.note}` : ""}</span
                >
                ${!r.current
                  ? html`<sonic-button
                      type="button"
                      size="sm"
                      ?disabled=${this.busy}
                      @click=${() => this.restore(r.version)}
                      >Restaurer</sonic-button
                    >`
                  : null}
              </li>
            `,
          )}
        </ul>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "artifact-versions-page": ArtifactVersionsPage;
  }
}
