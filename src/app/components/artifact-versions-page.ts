import "@supersoniks/concorde/button";
import "@supersoniks/concorde/icon";
import {css, html, LitElement, nothing} from "lit";
import {customElement, property, state} from "lit/decorators.js";
import {listVersions, restoreVersion} from "../cloud/client";
import {loadArtifactsAccount} from "../cloud/account";
import {explainFetchError, loadApiBaseUrl} from "../cloud/api-base";
import {navigate} from "../navigate";
import {fullDate, relativeTime, uiStyles} from "../styles/ui";

type Row = {version: number; createdAt: string; note?: string | null; current: boolean};

const versionsStyles = css`
  .timeline {
    display: flex;
    flex-direction: column;
  }
  .row {
    display: grid;
    grid-template-columns: 4.5rem minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--ui-3) var(--ui-4);
    padding: var(--ui-4);
    border-bottom: 1px solid var(--ui-line);
  }
  .row:last-child {
    border-bottom: 0;
  }
  .row[data-current="true"] {
    background: var(--ui-selected);
  }
  .num-v {
    font-family: var(--sc-font-family-headings, inherit);
    font-size: var(--ui-fs-lg);
    font-weight: 700;
  }
  .when {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    font-size: var(--ui-fs-sm);
  }
  .when .note {
    overflow-wrap: anywhere;
  }
  .when time {
    color: var(--ui-muted);
  }
  .now {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-1);
    font-size: var(--ui-fs-xs);
    font-weight: 600;
  }
  @media (max-width: 559px) {
    .row {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .row .num-v {
      grid-column: 1;
    }
    .row .when {
      grid-column: 1 / -1;
      grid-row: 2;
    }
    .row .end {
      grid-column: 2;
      grid-row: 1;
    }
  }
`;

@customElement("artifact-versions-page")
export class ArtifactVersionsPage extends LitElement {
  static styles = [uiStyles, versionsStyles];

  @property({type: String}) slug = "";
  @state() private rows: Row[] = [];
  @state() private error = "";
  @state() private busy = false;
  @state() private loading = true;
  @state() private restored: number | null = null;

  connectedCallback() {
    super.connectedCallback();
    void this.load();
  }

  private async load() {
    if (!loadArtifactsAccount()) {
      this.error = "Connectez-vous pour gérer les versions.";
      this.loading = false;
      return;
    }
    try {
      this.rows = await listVersions(this.slug);
    } catch (e) {
      this.error = explainFetchError(e, loadApiBaseUrl());
    } finally {
      this.loading = false;
    }
  }

  private async restore(n: number) {
    if (!confirm(`Restaurer la version ${n} ? Son contenu devient une nouvelle version courante ; l’historique est conservé.`)) return;
    this.busy = true;
    this.error = "";
    this.restored = null;
    try {
      await restoreVersion(this.slug, n);
      await this.load();
      this.restored = n;
    } catch (e) {
      this.error = explainFetchError(e, loadApiBaseUrl());
    } finally {
      this.busy = false;
    }
  }

  private back(e: Event) {
    e.preventDefault();
    navigate(`/admin/${this.slug}/edit`);
  }

  private renderRow(r: Row) {
    return html`
      <li class="row" data-current=${r.current ? "true" : "false"}>
        <span class="num-v num">v${r.version}</span>
        <div class="when">
          ${r.note ? html`<span class="note">${r.note}</span>` : nothing}
          <time datetime=${r.createdAt} title=${fullDate(r.createdAt)}>${relativeTime(r.createdAt)}</time>
        </div>
        <div class="end">
          ${r.current
            ? html`<span class="now"
                ><sonic-icon library="custom" name="check" size="xs"></sonic-icon> Version courante</span
              >`
            : html`<sonic-button
                size="sm"
                variant="outline"
                ?disabled=${this.busy}
                data-aria-label=${`Restaurer la version ${r.version}`}
                @click=${() => this.restore(r.version)}
                >Restaurer</sonic-button
              >`}
        </div>
      </li>
    `;
  }

  render() {
    return html`
      <div class="page page-narrow">
        <div class="page-head">
          <div class="titles">
            <a class="crumb" href=${`/admin/${this.slug}/edit`} @click=${(e: Event) => this.back(e)}>
              <sonic-icon library="custom" name="nav-arrow-left" size="sm"></sonic-icon>
              ${this.slug}
            </a>
            <h1>Historique des versions</h1>
            <p class="sub">
              Chaque publication crée une version. Restaurer recopie une ancienne version en nouvelle version courante ; l’historique reste intact.
            </p>
          </div>
          <div class="actions">
            <sonic-button
              size="sm"
              variant="outline"
              @click=${() => window.open(`/${this.slug}/`, "_blank", "noopener,noreferrer")}
            >
              <sonic-icon slot="prefix" library="custom" name="open-new-window" size="sm"></sonic-icon>
              Ouvrir l’artefact
            </sonic-button>
          </div>
        </div>

        ${this.error
          ? html`<div class="notice" data-tone="danger" role="alert">
              <sonic-icon library="custom" name="warning-triangle" size="sm"></sonic-icon>
              <span class="grow">${this.error}</span>
            </div>`
          : nothing}
        ${this.restored !== null
          ? html`<div class="notice" data-tone="success" role="status">
              <sonic-icon library="custom" name="check" size="sm"></sonic-icon>
              <span class="grow">Le contenu de la version ${this.restored} est restauré : il forme la nouvelle version courante.</span>
            </div>`
          : nothing}
        ${this.loading
          ? html`<div class="panel" aria-busy="true">
              ${[0, 1, 2].map(
                () => html`<div class="row"><span class="skeleton"></span><span class="skeleton"></span></div>`,
              )}
            </div>`
          : this.rows.length === 0 && !this.error
            ? html`<div class="panel empty"><h2>Aucune version</h2><p>Cet artefact n’a pas encore été publié.</p></div>`
            : html`<ol class="panel timeline" aria-label="Versions">
                ${this.rows.map((r) => this.renderRow(r))}
              </ol>`}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "artifact-versions-page": ArtifactVersionsPage;
  }
}
