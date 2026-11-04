import "@supersoniks/concorde/button";
import "@supersoniks/concorde/icon";
import {css, html, LitElement, nothing} from "lit";
import {customElement, state} from "lit/decorators.js";
import {repeat} from "lit/directives/repeat.js";
import {relativeTime, uiStyles} from "../styles/ui";
import {loadArtifactsAccount} from "../cloud/account";
import {
  deleteResource,
  getResource,
  getResourceContent,
  listResources,
  tadaaaLoginUrl,
  updateResourceFromBase,
  type ResourceSummary,
  type ResourceVersion,
} from "../cloud/client";
import {explainFetchError, loadApiBaseUrl} from "../cloud/api-base";
import {navigate} from "../navigate";

const KINDS: {value: string; label: string}[] = [
  {value: "", label: "Tout"},
  {value: "shader", label: "Shaders"},
  {value: "model3d", label: "3D"},
  {value: "data", label: "Données"},
  {value: "image", label: "Images"},
  {value: "audio", label: "Audio"},
];

const SOURCES: {value: string; label: string}[] = [
  {value: "", label: "Toutes"},
  {value: "mine", label: "Mes ressources"},
  {value: "base", label: "Base"},
];

const kindLabel = (k: string) => KINDS.find((x) => x.value === k)?.label ?? k;

function formatSize(n?: number): string {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / 1024 / 1024).toFixed(1)} Mo`;
}

const resourcesStyles = css`
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 26rem);
    gap: var(--ui-4);
    align-items: start;
  }
  @media (max-width: 62rem) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-3);
    align-items: center;
    margin-bottom: var(--ui-4);
  }
  .filters input[type="search"] {
    flex: 1 1 14rem;
    min-width: 0;
    padding: var(--ui-2) var(--ui-3);
    border: 1px solid var(--ui-line);
    border-radius: var(--ui-radius, 0.5rem);
    background: transparent;
    color: inherit;
    font: inherit;
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
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }
  .row {
    display: block;
    width: 100%;
    padding: var(--ui-3) var(--ui-4);
    border: 0;
    border-bottom: 1px solid var(--ui-line);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .row:hover,
  .row[aria-current="true"] {
    background: var(--ui-hover);
  }
  .row .name {
    display: flex;
    gap: var(--ui-2);
    align-items: center;
    flex-wrap: wrap;
    font-weight: 600;
  }
  .row .meta {
    margin-top: var(--ui-1);
    color: var(--ui-muted);
    font-size: var(--ui-fs-xs);
  }
  .row .desc {
    margin-top: var(--ui-1);
    font-size: var(--ui-fs-sm);
  }
  .detail {
    padding: var(--ui-4);
    display: grid;
    gap: var(--ui-3);
  }
  .detail h2 {
    margin: 0;
  }
  .detail .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-2);
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-1);
  }
  pre {
    margin: 0;
    max-height: 22rem;
    overflow: auto;
    padding: var(--ui-3);
    border: 1px solid var(--ui-line);
    border-radius: var(--ui-radius, 0.5rem);
    font-size: var(--ui-fs-xs);
    white-space: pre-wrap;
    word-break: break-word;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--ui-1) var(--ui-3);
    margin: 0;
    font-size: var(--ui-fs-sm);
  }
  dt {
    color: var(--ui-muted);
  }
  dd {
    margin: 0;
  }
  h3 {
    margin: 0;
    font-size: var(--ui-fs-sm);
  }
`;

@customElement("artifact-resources-page")
export class ArtifactResourcesPage extends LitElement {
  static styles = [uiStyles, resourcesStyles];

  @state() private items: ResourceSummary[] = [];
  @state() private loading = false;
  @state() private error = "";
  @state() private notice = "";
  @state() private q = "";
  @state() private kind = "";
  @state() private source = "";
  @state() private tag = "";
  @state() private selectedRef = "";
  @state() private detail: ResourceSummary | null = null;
  @state() private versions: ResourceVersion[] = [];
  @state() private content: string | null | undefined = undefined;
  @state() private busy = false;
  @state() private copied = false;

  private debounce: ReturnType<typeof setTimeout> | undefined;
  /** Évite qu’une réponse tardive écrase une recherche plus récente. */
  private listSeq = 0;
  private detailSeq = 0;

  connectedCallback() {
    super.connectedCallback();
    const wanted = new URLSearchParams(location.search).get("ref");
    if (wanted) void this.openResource(wanted);
    void this.refresh();
  }

  disconnectedCallback() {
    clearTimeout(this.debounce);
    super.disconnectedCallback();
  }

  private login() {
    sessionStorage.setItem("artifacts-return-after-login", "/admin/ressources");
    location.assign(tadaaaLoginUrl(`${location.origin}/cloud`));
  }

  private async refresh() {
    if (!loadArtifactsAccount()) return;
    const seq = ++this.listSeq;
    this.loading = true;
    this.error = "";
    try {
      const rows = await listResources({
        q: this.q.trim() || undefined,
        kind: this.kind || undefined,
        tag: this.tag || undefined,
        base: this.source === "" ? undefined : this.source === "base",
        limit: 200,
      });
      if (seq !== this.listSeq) return;
      this.items = rows;
    } catch (e) {
      if (seq !== this.listSeq) return;
      this.error = explainFetchError(e, loadApiBaseUrl());
    } finally {
      if (seq === this.listSeq) this.loading = false;
    }
  }

  private onSearch(e: Event) {
    this.q = (e.target as HTMLInputElement).value;
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.refresh(), 250);
  }

  private setKind(v: string) {
    this.kind = v;
    void this.refresh();
  }

  private setSource(v: string) {
    this.source = v;
    void this.refresh();
  }

  private setTag(v: string) {
    this.tag = this.tag === v ? "" : v;
    void this.refresh();
  }

  private async openResource(ref: string) {
    const seq = ++this.detailSeq;
    this.selectedRef = ref;
    this.detail = null;
    this.versions = [];
    this.content = undefined;
    this.notice = "";
    try {
      const {resource, versions} = await getResource(ref);
      if (seq !== this.detailSeq) return;
      this.detail = resource;
      this.versions = versions;
      const text = await getResourceContent(ref).catch(() => null);
      if (seq !== this.detailSeq) return;
      this.content = text;
    } catch (e) {
      if (seq !== this.detailSeq) return;
      this.error = explainFetchError(e, loadApiBaseUrl());
    }
  }

  private reprompt(r: ResourceSummary) {
    navigate(`/admin/atelier?resource=${encodeURIComponent(r.ref)}`);
  }

  private async copyContent() {
    if (!this.content) return;
    try {
      await navigator.clipboard.writeText(this.content);
      this.copied = true;
      setTimeout(() => (this.copied = false), 1500);
    } catch {
      this.notice = "Copie impossible : sélectionnez le texte manuellement.";
    }
  }

  private async downloadContent(r: ResourceSummary) {
    try {
      const text = await getResourceContent(r.ref, undefined, Number.MAX_SAFE_INTEGER);
      if (text === null) {
        this.notice = "Fichier binaire : téléchargement non pris en charge depuis cette page.";
        return;
      }
      const ext = r.kind === "shader" ? "glsl" : r.kind === "data" ? "json" : "txt";
      const url = URL.createObjectURL(new Blob([text], {type: "text/plain"}));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${r.slug}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      this.error = explainFetchError(e, loadApiBaseUrl());
    }
  }

  private async updateFromBase(r: ResourceSummary) {
    this.busy = true;
    this.error = "";
    try {
      await updateResourceFromBase(r);
      this.notice = "Ressource mise à jour depuis la base.";
      await this.refresh();
      await this.openResource(r.ref);
    } catch (e) {
      this.error = explainFetchError(e, loadApiBaseUrl());
    } finally {
      this.busy = false;
    }
  }

  private async deleteResourceItem(r: ResourceSummary) {
    if (!confirm(`Supprimer « ${r.name} » ? Les artefacts qui l’ont déjà copiée ne changent pas.`)) return;
    this.busy = true;
    try {
      await deleteResource(r.slug);
      this.selectedRef = "";
      this.detail = null;
      await this.refresh();
    } catch (e) {
      this.error = explainFetchError(e, loadApiBaseUrl());
    } finally {
      this.busy = false;
    }
  }

  private allTags(): string[] {
    const set = new Set<string>();
    for (const r of this.items) for (const t of r.tags ?? []) set.add(t);
    if (this.tag) set.add(this.tag);
    return [...set].sort((a, b) => a.localeCompare(b)).slice(0, 24);
  }

  private renderRow(r: ResourceSummary) {
    return html`
      <li>
        <button
          type="button"
          class="row"
          aria-current=${r.ref === this.selectedRef ? "true" : "false"}
          @click=${() => void this.openResource(r.ref)}
        >
          <span class="name">
            ${r.name}
            <span class="pill">${kindLabel(r.kind)}</span>
            ${r.source === "base" ? html`<span class="pill">Base</span>` : nothing}
            ${r.updateAvailable
              ? html`<span class="pill" data-tone="warning">Mise à jour disponible</span>`
              : nothing}
          </span>
          ${r.description ? html`<div class="desc">${r.description}</div>` : nothing}
          <div class="meta">
            v${r.version} · ${formatSize(r.sizeBytes)}${r.updatedAt ? html` · ${relativeTime(r.updatedAt)}` : nothing}
          </div>
        </button>
      </li>
    `;
  }

  private renderDetail() {
    if (!this.selectedRef) {
      return html`<div class="panel empty"><p>Sélectionnez une ressource pour la voir, la reprendre dans l’atelier ou la télécharger.</p></div>`;
    }
    const r = this.detail;
    if (!r) return html`<div class="panel empty"><p>Chargement…</p></div>`;
    const params = Array.isArray(r.params) ? (r.params as Record<string, unknown>[]) : [];
    return html`
      <div class="panel detail">
        <div>
          <h2>${r.name}</h2>
          <div class="tags">
            <span class="pill">${kindLabel(r.kind)}</span>
            ${r.source === "base" ? html`<span class="pill">Base</span>` : nothing}
            ${(r.tags ?? []).map((t) => html`<span class="pill">${t}</span>`)}
          </div>
        </div>
        ${r.description ? html`<p>${r.description}</p>` : nothing}
        ${r.updateAvailable && r.base
          ? html`<div class="notice" data-tone="warning">
              La base propose la v${r.base.latest} (votre copie : v${r.base.version}).
            </div>`
          : nothing}
        ${this.notice ? html`<div class="notice">${this.notice}</div>` : nothing}
        <div class="actions">
          <sonic-button type="primary" size="sm" @click=${() => this.reprompt(r)}>
            <sonic-icon slot="prefix" library="custom" name="chat-bubble" size="sm"></sonic-icon>
            Reprompter
          </sonic-button>
          ${r.updateAvailable && r.base
            ? html`<sonic-button size="sm" ?disabled=${this.busy} @click=${() => void this.updateFromBase(r)}>
                <sonic-icon slot="prefix" library="custom" name="refresh" size="sm"></sonic-icon>
                Mettre à jour depuis la base
              </sonic-button>`
            : nothing}
          <sonic-button size="sm" variant="outline" ?disabled=${!this.content} @click=${() => void this.copyContent()}>
            <sonic-icon slot="prefix" library="custom" name=${this.copied ? "check" : "copy"} size="sm"></sonic-icon>
            ${this.copied ? "Copié" : "Copier"}
          </sonic-button>
          <sonic-button size="sm" variant="outline" @click=${() => void this.downloadContent(r)}>
            Télécharger
          </sonic-button>
          ${r.source === "mine"
            ? html`<sonic-button size="sm" variant="ghost" ?disabled=${this.busy} @click=${() => void this.deleteResourceItem(r)}>
                <sonic-icon slot="prefix" library="custom" name="trash" size="sm"></sonic-icon>
                Supprimer
              </sonic-button>`
            : nothing}
        </div>
        <dl>
          <dt>Référence</dt>
          <dd><code>${r.ref}</code></dd>
          <dt>Version</dt>
          <dd>v${r.version}${r.base ? html` (base : <code>${r.base.ref}</code>)` : nothing}</dd>
          ${r.license ? html`<dt>Licence</dt><dd>${r.license}</dd>` : nothing}
          <dt>Taille</dt>
          <dd>${formatSize(r.sizeBytes)}</dd>
        </dl>
        ${r.prompt
          ? html`<h3>Prompt d’origine</h3>
              <pre>${r.prompt}</pre>`
          : nothing}
        ${params.length
          ? html`<h3>Paramètres</h3>
              <dl>
                ${params.map(
                  (p) =>
                    html`<dt>${String(p.uParam ?? p.id ?? "")}</dt>
                      <dd>${String(p.label ?? "")}${p.min !== undefined ? html` [${String(p.min)} – ${String(p.max)}]` : nothing}</dd>`,
                )}
              </dl>`
          : nothing}
        ${this.versions.length > 1
          ? html`<h3>Versions</h3>
              <dl>
                ${this.versions.map(
                  (v) => html`<dt>v${v.version}</dt><dd>${relativeTime(v.createdAt)} · ${formatSize(v.sizeBytes)}</dd>`,
                )}
              </dl>`
          : nothing}
        <h3>Contenu</h3>
        ${this.content === undefined
          ? html`<p class="sub">Chargement…</p>`
          : this.content === null
            ? html`<p class="sub">Aperçu indisponible pour ce type de fichier.</p>`
            : html`<pre>${this.content}</pre>`}
      </div>
    `;
  }

  render() {
    if (!loadArtifactsAccount()) {
      return html`
        <div class="page page-narrow">
          <h1>Ressources</h1>
          <div class="panel empty">
            <h2>Connectez-vous pour accéder à vos ressources</h2>
            <p>Shaders, modèles 3D et données réutilisables sont liés à votre compte Tadaaa.</p>
            <sonic-button type="primary" @click=${() => this.login()}>
              Se connecter avec Tadaaa
            </sonic-button>
          </div>
        </div>
      `;
    }
    const tags = this.allTags();
    return html`
      <div class="page">
        <div class="page-head">
          <div class="titles">
            <h1>Ressources</h1>
            <p class="sub" aria-live="polite">
              ${this.loading ? "Chargement…" : `${this.items.length} ressource${this.items.length > 1 ? "s" : ""}`}
            </p>
          </div>
          <div class="actions">
            <sonic-button
              type="default"
              variant="ghost"
              size="sm"
              ?disabled=${this.loading}
              title="Actualiser"
              aria-label="Actualiser la liste"
              @click=${() => void this.refresh()}
            >
              <sonic-icon library="custom" name="refresh" size="sm"></sonic-icon>
            </sonic-button>
            <sonic-button type="primary" @click=${() => navigate("/admin/atelier")}>
              <sonic-icon slot="prefix" library="custom" name="chat-bubble" size="sm"></sonic-icon>
              Créer avec l’atelier
            </sonic-button>
          </div>
        </div>

        ${this.error ? html`<div class="notice" data-tone="danger" role="alert">${this.error}</div>` : nothing}

        <div class="filters">
          <input
            type="search"
            placeholder="Nom, description, tag ou prompt…"
            aria-label="Rechercher une ressource"
            .value=${this.q}
            @input=${(e: Event) => this.onSearch(e)}
          />
          <div class="seg" role="radiogroup" aria-label="Type">
            ${KINDS.map(
              (k) => html`<button
                type="button"
                role="radio"
                aria-checked=${this.kind === k.value ? "true" : "false"}
                @click=${() => this.setKind(k.value)}
              >
                ${k.label}
              </button>`,
            )}
          </div>
          <div class="seg" role="radiogroup" aria-label="Origine">
            ${SOURCES.map(
              (s) => html`<button
                type="button"
                role="radio"
                aria-checked=${this.source === s.value ? "true" : "false"}
                @click=${() => this.setSource(s.value)}
              >
                ${s.label}
              </button>`,
            )}
          </div>
        </div>
        ${tags.length
          ? html`<div class="tags filters" aria-label="Tags">
              ${tags.map(
                (t) => html`<span class="seg"
                  ><button type="button" role="checkbox" aria-checked=${this.tag === t ? "true" : "false"} @click=${() => this.setTag(t)}>
                    ${t}
                  </button></span
                >`,
              )}
            </div>`
          : nothing}

        <div class="layout">
          <div class="panel list">
            ${this.items.length
              ? html`<ul class="list">
                  ${repeat(this.items, (r) => r.ref, (r) => this.renderRow(r))}
                </ul>`
              : html`<div class="empty">
                  <p>${this.loading ? "Chargement…" : "Aucune ressource ne correspond."}</p>
                </div>`}
          </div>
          ${this.renderDetail()}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "artifact-resources-page": ArtifactResourcesPage;
  }
}
