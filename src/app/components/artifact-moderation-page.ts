import "@supersoniks/concorde/button";
import "@supersoniks/concorde/icon";
import {css, html, LitElement, nothing} from "lit";
import {customElement, state} from "lit/decorators.js";
import {repeat} from "lit/directives/repeat.js";
import {relativeTime, uiStyles} from "../styles/ui";
import {loadArtifactsAccount} from "../cloud/account";
import {decideModeration, isSuperAdmin, listModeration, tadaaaLoginUrl, cloudReturnUrl, type ModerationItem} from "../cloud/client";
import {explainFetchError, loadApiBaseUrl} from "../cloud/api-base";

const FILTERS: {value: string; label: string}[] = [
  {value: "open", label: "À traiter"},
  {value: "hidden", label: "Masqués"},
  {value: "kept", label: "Laissés visibles"},
  {value: "deleted", label: "Retirés"},
  {value: "", label: "Tout"},
];

const STATUS: Record<ModerationItem["status"], {label: string; color: string}> = {
  open: {label: "À traiter", color: "var(--sc-warning, #d97706)"},
  kept: {label: "Laissé visible", color: "var(--sc-success, #16a34a)"},
  hidden: {label: "Masqué", color: "var(--sc-base-500)"},
  deleted: {label: "Retiré", color: "var(--sc-danger, #dc2626)"},
};

const KIND: Record<ModerationItem["kind"], string> = {place: "Balise", message: "Message", visitor: "Blaze", route: "Parcours"};

/**
 * Modération de tous les artefacts (super admin) : contenus signalés par les visiteurs (balises, messages, blazes,
 * parcours), avec leur contenu, et trois décisions : laisser visible, masquer, retirer.
 */
@customElement("artifact-moderation-page")
export class ArtifactModerationPage extends LitElement {
  static styles = [
    uiStyles,
    css`
      .filters {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ui-2);
        margin-bottom: var(--ui-4);
      }
      .seg {
        display: inline-flex;
        gap: var(--ui-1, 0.25rem);
        flex-wrap: wrap;
      }
      .seg button {
        padding: var(--ui-1) var(--ui-3);
        border: 1px solid var(--ui-line);
        border-radius: 999px;
        background: transparent;
        color: inherit;
        font: inherit;
        font-size: var(--ui-fs-sm);
        cursor: pointer;
      }
      .seg button[aria-checked="true"] {
        background: var(--ui-hover);
        border-color: currentColor;
        font-weight: 600;
      }
      .cases {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--ui-3);
      }
      .case {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: var(--ui-3) var(--ui-4);
        padding: var(--ui-4);
      }
      @media (max-width: 48rem) {
        .case {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--ui-2);
        font-size: var(--ui-fs-sm);
        color: var(--ui-muted, var(--sc-base-600));
      }
      .meta strong {
        color: var(--sc-base-content, inherit);
      }
      .body {
        display: flex;
        gap: var(--ui-3);
        align-items: flex-start;
        margin-top: var(--ui-2);
      }
      .body img {
        flex: none;
        width: 7rem;
        height: 7rem;
        object-fit: contain;
        border-radius: var(--ui-radius, 0.75rem);
        background: #fff;
        border: 1px solid var(--ui-line);
      }
      .text {
        margin: 0;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .who {
        font-weight: 600;
      }
      .gone {
        font-style: italic;
        color: var(--ui-muted, var(--sc-base-600));
      }
      audio {
        width: 100%;
        max-width: 22rem;
        margin-top: var(--ui-2);
      }
      .decide {
        display: flex;
        flex-direction: column;
        gap: var(--ui-2);
        min-width: 12rem;
      }
      @media (max-width: 48rem) {
        .decide {
          flex-direction: row;
          flex-wrap: wrap;
        }
      }
      .confirm {
        font-size: var(--ui-fs-sm);
      }
    `,
  ];

  @state() private filter = "open";
  @state() private items: ModerationItem[] = [];
  @state() private open = 0;
  @state() private loading = true;
  @state() private allowed: boolean | null = null;
  @state() private error = "";
  @state() private busy = "";
  @state() private confirmDelete = "";

  connectedCallback(): void {
    super.connectedCallback();
    void this.start();
  }

  private async start(): Promise<void> {
    if (!loadArtifactsAccount()) {
      this.allowed = false;
      this.loading = false;
      return;
    }
    this.allowed = await isSuperAdmin();
    if (this.allowed) await this.refresh();
    else this.loading = false;
  }

  private async refresh(): Promise<void> {
    this.loading = true;
    this.error = "";
    try {
      const r = await listModeration(this.filter);
      this.items = r.items;
      this.open = r.open;
    } catch (e) {
      this.error = explainFetchError(e, loadApiBaseUrl());
    } finally {
      this.loading = false;
    }
  }

  private setFilter(v: string): void {
    if (this.filter === v) return;
    this.filter = v;
    void this.refresh();
  }

  private async decide(item: ModerationItem, action: "keep" | "hide" | "delete"): Promise<void> {
    this.busy = item.id;
    this.confirmDelete = "";
    this.error = "";
    try {
      const updated = await decideModeration(item.id, action);
      // Réglé : sort de la file « À traiter », reste visible (à jour) ailleurs.
      this.items = this.filter === "open" || (this.filter && this.filter !== updated.status)
        ? this.items.filter((x) => x.id !== item.id)
        : this.items.map((x) => (x.id === item.id ? updated : x));
      if (item.status === "open") this.open = Math.max(0, this.open - 1);
    } catch (e) {
      this.error = explainFetchError(e, loadApiBaseUrl());
    } finally {
      this.busy = "";
    }
  }

  private renderContent(item: ModerationItem) {
    const c = item.content;
    if (!c) return html`<p class="text gone">Le contenu n’existe plus (retiré par son auteur ou supprimé).</p>`;
    if (c.deleted) return html`<p class="text gone">Contenu retiré : il ne reste qu’une trace dans la discussion.</p>`;
    return html`
      <div class="body">
        ${c.image ? html`<img src=${c.image} alt=${item.kind === "visitor" ? "Avatar signalé" : "Dessin signalé"} loading="lazy" />` : nothing}
        <div>
          ${c.pseudo ? html`<div class="who">${c.pseudo}</div>` : nothing}
          ${c.text ? html`<p class="text">${c.text}</p>` : nothing}
          ${c.audio ? html`<audio controls preload="none" src=${c.audio}></audio>` : nothing}
          ${!c.text && !c.image && !c.audio && !c.pseudo ? html`<p class="text gone">Sans texte ni média.</p>` : nothing}
        </div>
      </div>
    `;
  }

  private renderCase(item: ModerationItem) {
    const st = STATUS[item.status];
    const busy = this.busy === item.id;
    return html`
      <li class="panel case">
        <div>
          <div class="meta">
            <span class="pill" style=${`--pill:${st.color}`}>${st.label}</span>
            <strong>${KIND[item.kind]}</strong>
            <span>dans <a href=${`/${item.artifact.slug}`} target="_blank" rel="noopener">${item.artifact.title}</a></span>
            <span>· ${item.reports} signalement${item.reports > 1 ? "s" : ""}, le dernier ${relativeTime(item.lastReportedAt)}</span>
            ${item.decidedAt ? html`<span>· réglé ${relativeTime(item.decidedAt)}${item.decidedBy ? ` par ${item.decidedBy}` : ""}</span>` : nothing}
          </div>
          ${this.renderContent(item)}
        </div>
        ${(!item.content || item.content.deleted) && item.status === "open"
          ? html`<div class="decide">
              <sonic-button size="sm" ?disabled=${busy} @click=${() => void this.decide(item, "keep")}>Classer</sonic-button>
            </div>`
          : nothing}
        ${item.content && !item.content.deleted
          ? html`<div class="decide">
              ${item.status !== "kept"
                ? html`<sonic-button size="sm" ?disabled=${busy} @click=${() => void this.decide(item, "keep")}>
                    <sonic-icon slot="prefix" library="custom" name="check" size="sm"></sonic-icon>Laisser visible
                  </sonic-button>`
                : nothing}
              ${item.status !== "hidden"
                ? html`<sonic-button size="sm" ?disabled=${busy} @click=${() => void this.decide(item, "hide")}>
                    <sonic-icon slot="prefix" library="custom" name="eye-closed" size="sm"></sonic-icon>Masquer
                  </sonic-button>`
                : nothing}
              ${this.confirmDelete === item.id
                ? html`<span class="confirm">Retirer pour de bon ?</span>
                    <sonic-button size="sm" type="danger" ?disabled=${busy} @click=${() => void this.decide(item, "delete")}>Oui, retirer</sonic-button>
                    <sonic-button size="sm" variant="ghost" @click=${() => (this.confirmDelete = "")}>Annuler</sonic-button>`
                : html`<sonic-button size="sm" variant="ghost" type="danger" ?disabled=${busy} @click=${() => (this.confirmDelete = item.id)}>
                    <sonic-icon slot="prefix" library="custom" name="trash" size="sm"></sonic-icon>Retirer
                  </sonic-button>`}
            </div>`
          : nothing}
      </li>
    `;
  }

  render() {
    if (this.allowed === false) {
      const connected = !!loadArtifactsAccount();
      return html`
        <div class="page page-narrow">
          <h1>Modération</h1>
          <div class="panel empty">
            <h2>${connected ? "Réservé au super admin" : "Connectez-vous"}</h2>
            <p>La modération de tous les artefacts est réservée à l’administrateur de Tadaaa.</p>
            ${connected
              ? nothing
              : html`<sonic-button type="primary" @click=${() => location.assign(tadaaaLoginUrl(cloudReturnUrl("/admin/moderation")))}>Se connecter avec Tadaaa</sonic-button>`}
          </div>
        </div>
      `;
    }
    return html`
      <div class="page">
        <div class="page-head">
          <div class="titles">
            <h1>Modération</h1>
            <p class="sub" aria-live="polite">
              ${this.loading ? "Chargement…" : this.open ? `${this.open} contenu${this.open > 1 ? "s" : ""} à traiter` : "Rien à traiter"}
            </p>
          </div>
          <div class="actions">
            <sonic-button variant="ghost" size="sm" ?disabled=${this.loading} title="Actualiser" aria-label="Actualiser la liste" @click=${() => void this.refresh()}>
              <sonic-icon library="custom" name="refresh" size="sm"></sonic-icon>
            </sonic-button>
          </div>
        </div>
        ${this.error ? html`<div class="notice" data-tone="danger" role="alert">${this.error}</div>` : nothing}
        <div class="filters">
          <div class="seg" role="radiogroup" aria-label="Dossiers">
            ${FILTERS.map(
              (f) => html`<button type="button" role="radio" aria-checked=${this.filter === f.value ? "true" : "false"} @click=${() => this.setFilter(f.value)}>
                ${f.label}${f.value === "open" && this.open ? ` (${this.open})` : ""}
              </button>`,
            )}
          </div>
        </div>
        ${!this.loading && this.items.length === 0
          ? html`<div class="panel empty"><h2>${this.filter === "open" ? "Aucun signalement en attente" : "Aucun dossier"}</h2>
              <p>Les balises, messages, blazes et parcours signalés par les visiteurs arrivent ici.</p></div>`
          : html`<ul class="cases">${repeat(this.items, (i) => i.id, (i) => this.renderCase(i))}</ul>`}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "artifact-moderation-page": ArtifactModerationPage;
  }
}
