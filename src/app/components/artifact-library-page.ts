import "@supersoniks/concorde/button";
import "@supersoniks/concorde/icon";
import "@supersoniks/concorde/badge";
import "@supersoniks/concorde/checkbox";
import "@supersoniks/concorde/pop";
import "@supersoniks/concorde/menu";
import "@supersoniks/concorde/menu-item";
import "@supersoniks/concorde/divider";
import "@supersoniks/concorde/tooltip";
import {css, html, LitElement, nothing} from "lit";
import {customElement, state} from "lit/decorators.js";
import {subscribe} from "@supersoniks/concorde/decorators";
import {dp, set} from "@supersoniks/concorde/utils";
import {repeat} from "lit/directives/repeat.js";
import {fullDate, hidePop, relativeTime, uiStyles, VISIBILITY_LABELS} from "../styles/ui";
import {
  artifactListFilterKey,
  emptyArtifactListFilter,
  type ArtifactListFilter,
} from "../dp";
import {loadArtifactsAccount} from "../cloud/account";
import {
  artifactSharePath,
  deleteArtifact,
  listMyArtifacts,
  tadaaaLoginUrl,
  type ArtifactSummary,
} from "../cloud/client";
import {explainFetchError, loadApiBaseUrl} from "../cloud/api-base";
import {navigate} from "../navigate";
import "./artifact-filter-bar";
import type {FilterSelectConfig} from "./artifact-filter-bar";

const VISIBILITY_OPTS = [
  {value: "all", label: "Toutes"},
  {value: "public", label: "Public"},
  {value: "link", label: "Lien"},
  {value: "private", label: "Privé"},
] as const;

const SORT_OPTS = [
  {value: "updatedAt", label: "Modifié récemment"},
  {value: "title", label: "Titre"},
  {value: "slug", label: "Slug"},
] as const;

const libraryStyles = css`
  .grow {
    flex: 1;
  }
  .list {
    overflow: hidden;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--ui-fs-sm);
  }
  th {
    padding: var(--ui-2) var(--ui-3);
    border-bottom: 1px solid var(--ui-line);
    color: var(--ui-muted);
    font-size: var(--ui-fs-xs);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-align: start;
    text-transform: uppercase;
    white-space: nowrap;
  }
  td {
    padding: var(--ui-3);
    vertical-align: middle;
  }
  tbody tr {
    border-bottom: 1px solid var(--ui-line);
    transition: background-color 0.12s;
  }
  tbody tr:last-child {
    border-bottom: 0;
  }
  tbody tr:hover {
    background: var(--ui-hover);
  }
  tbody tr[data-selected="true"] {
    background: var(--ui-selected);
  }
  .c-check {
    width: 3rem;
    padding-inline: var(--ui-1) 0;
  }
  .check {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    cursor: pointer;
  }
  .check input {
    width: 1.1rem;
    height: 1.1rem;
    margin: 0;
    cursor: pointer;
  }
  .c-title {
    min-width: 0;
  }
  .title {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
    font-size: var(--ui-fs-md);
    font-weight: 600;
    text-decoration: none;
  }
  .title:hover {
    text-decoration: underline;
  }
  .slug {
    display: block;
    overflow: hidden;
    color: var(--ui-muted);
    font-size: var(--ui-fs-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .c-vis,
  .c-ver,
  .c-date {
    display: none;
    white-space: nowrap;
  }
  .c-date {
    color: var(--ui-muted);
  }
  .c-act {
    width: 3rem;
    padding-inline: 0 var(--ui-2);
    text-align: end;
    white-space: nowrap;
  }
  .refresh {
    order: 2;
  }
  .open {
    display: none;
  }
  .more {
    display: inline-block;
  }
  .meta-m {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ui-1) var(--ui-3);
    margin-top: var(--ui-1);
    color: var(--ui-muted);
    font-size: var(--ui-fs-xs);
  }
  /* Mobile : pas d'en-tête de colonnes, une ligne = case · titre · menu. */
  thead {
    display: none;
  }
  .selbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ui-2);
    padding: var(--ui-2) var(--ui-3);
    background: var(--ui-selected);
    border-bottom: 1px solid var(--ui-line);
    font-size: var(--ui-fs-sm);
    font-weight: 600;
  }
  .toast {
    position: fixed;
    inset-block-end: calc(var(--ui-6) + env(safe-area-inset-bottom));
    inset-inline: 0;
    width: fit-content;
    margin-inline: auto;
    max-width: calc(100vw - 2rem);
    padding: var(--ui-2) var(--ui-4);
    border-radius: 9999px;
    background: var(--sc-base-content);
    color: var(--sc-base);
    font-size: var(--ui-fs-sm);
    font-weight: 500;
    box-shadow: var(--ui-shadow-pop);
    animation: toast-in 0.25s var(--ui-ease);
    z-index: 5;
  }
  @media (max-width: 767px) {
    .toast {
      inset-block-end: calc(4.5rem + env(safe-area-inset-bottom));
    }
  }
  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(0.5rem);
    }
  }
  .sk-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-4);
    padding: var(--ui-4);
    border-bottom: 1px solid var(--ui-line);
  }
  .sk-row:last-child {
    border-bottom: 0;
  }
  @media (min-width: 768px) {
    .refresh {
      order: 0;
    }
    thead {
      display: table-header-group;
    }
    .meta-m {
      display: none;
    }
    .c-vis,
    .c-date {
      display: table-cell;
    }
    .c-ver {
      display: table-cell;
    }
    .c-title {
      width: 100%;
    }
    .c-act {
      width: 6.5rem;
    }
    .open {
      display: inline-block;
    }
  }
  @media (min-width: 768px) and (max-width: 959px) {
    .c-ver {
      display: none;
    }
  }
`;

@customElement("artifact-library-page")
export class ArtifactLibraryPage extends LitElement {
  static styles = [uiStyles, libraryStyles];

  @subscribe(artifactListFilterKey)
  @state()
  filter: ArtifactListFilter = emptyArtifactListFilter();

  @state() private items: ArtifactSummary[] = [];
  @state() private error = "";
  @state() private loading = true;
  @state() private selected = new Set<string>();
  @state() private busy = false;
  @state() private copiedId = "";

  connectedCallback() {
    super.connectedCallback();
    dp(artifactListFilterKey);
    if (!dp(artifactListFilterKey).get()) {
      set(artifactListFilterKey, emptyArtifactListFilter());
    }
    void this.refresh();
  }

  private async refresh() {
    this.loading = true;
    this.error = "";
    if (!loadArtifactsAccount()) {
      this.items = [];
      this.loading = false;
      return;
    }
    try {
      this.items = await listMyArtifacts();
      this.selected = new Set();
    } catch (e) {
      this.error = explainFetchError(e, loadApiBaseUrl());
      this.items = [];
    } finally {
      this.loading = false;
    }
  }

  private login() {
    sessionStorage.setItem("artifacts-return-after-login", "/admin");
    location.assign(tadaaaLoginUrl(`${location.origin}/cloud`));
  }

  private filtered(): ArtifactSummary[] {
    const q = (this.filter?.q ?? "").trim().toLowerCase();
    const vis = this.filter?.visibility || "all";
    const sort = this.filter?.sort || "updatedAt";
    let rows = [...this.items];
    if (vis !== "all") {
      rows = rows.filter((a) => a.visibility === vis);
    }
    if (q) {
      rows = rows.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.slug.toLowerCase().includes(q) ||
          (a.description ?? "").toLowerCase().includes(q),
      );
    }
    rows.sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title, "fr");
      if (sort === "slug") return a.slug.localeCompare(b.slug, "fr");
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    });
    return rows;
  }

  private openArtifact(a: ArtifactSummary) {
    const path = artifactSharePath(a);
    window.open(path, "_blank", "noopener,noreferrer");
  }

  private async copyLink(a: ArtifactSummary) {
    const path = artifactSharePath(a);
    const url = new URL(path, location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      this.copiedId = a.id;
      window.setTimeout(() => {
        if (this.copiedId === a.id) this.copiedId = "";
      }, 2000);
    } catch {
      prompt("Copiez le lien :", url);
    }
  }

  private menuIcon(name: string) {
    return html`<sonic-icon slot="prefix" library="custom" name=${name} size="sm"></sonic-icon>`;
  }

  private renderActions(a: ArtifactSummary) {
    const copied = this.copiedId === a.id;
    return html`
      <sonic-button
        class="open"
        type="button"
        shape="circle"
        size="sm"
        variant="ghost"
        title="Ouvrir l’artefact"
        data-aria-label=${`Ouvrir ${a.title}`}
        @click=${() => this.openArtifact(a)}
      >
        <sonic-icon library="custom" name="open-new-window" size="md"></sonic-icon>
      </sonic-button>
      <sonic-pop class="more" placement="bottom-end" shadow="sm">
        <sonic-tooltip label="Actions" placement="left">
          <sonic-button
            type="button"
            shape="circle"
            size="sm"
            variant="ghost"
            ?disabled=${this.busy}
            data-aria-label=${`Actions pour ${a.title}`}
          >
            <sonic-icon library="custom" name="more-vert" size="lg"></sonic-icon>
          </sonic-button>
        </sonic-tooltip>
        <sonic-menu
          slot="content"
          direction="column"
          align="left"
          size="sm"
          minWidth="13rem"
        >
          <sonic-menu-item @click=${(e: Event) => { hidePop(e); this.openArtifact(a); }}>
            ${this.menuIcon("open-new-window")} Ouvrir l’artefact
          </sonic-menu-item>
          <sonic-menu-item @click=${(e: Event) => { hidePop(e); void this.copyLink(a); }}>
            ${this.menuIcon(copied ? "check" : "copy")} Copier le lien
          </sonic-menu-item>
          <sonic-menu-item @click=${(e: Event) => { hidePop(e); navigate(`/admin/${a.slug}/edit`); }}>
            ${this.menuIcon("edit-pencil")} Modifier
          </sonic-menu-item>
          <sonic-menu-item @click=${(e: Event) => { hidePop(e); navigate(`/admin/${a.slug}/atelier`); }}>
            ${this.menuIcon("chat-bubble")} Modifier avec l’atelier
          </sonic-menu-item>
          <sonic-menu-item @click=${(e: Event) => { hidePop(e); navigate(`/admin/${a.slug}/versions`); }}>
            ${this.menuIcon("clock")} Historique des versions
          </sonic-menu-item>
          <sonic-divider size="xs"></sonic-divider>
          <sonic-menu-item
            type="danger"
            ?disabled=${this.busy}
            @click=${(e: Event) => { hidePop(e); void this.removeOne(a); }}
          >
            ${this.menuIcon("trash")} Supprimer
          </sonic-menu-item>
        </sonic-menu>
      </sonic-pop>
    `;
  }

  private async removeOne(a: ArtifactSummary) {
    if (!confirm(`Supprimer « ${a.title} » ?`)) return;
    this.busy = true;
    try {
      await deleteArtifact(a.id);
      await this.refresh();
    } catch (e) {
      this.error = explainFetchError(e, loadApiBaseUrl());
    } finally {
      this.busy = false;
    }
  }

  private toggle(id: string, on: boolean) {
    const next = new Set(this.selected);
    if (on) next.add(id);
    else next.delete(id);
    this.selected = next;
  }

  private toggleAll(rows: ArtifactSummary[], on: boolean) {
    this.selected = on ? new Set(rows.map((r) => r.id)) : new Set();
  }

  private async removeSelected() {
    const ids = [...this.selected];
    if (!ids.length) return;
    if (!confirm(`Supprimer ${ids.length} artefact(s) ?`)) return;
    this.busy = true;
    try {
      await Promise.all(ids.map((id) => deleteArtifact(id)));
      await this.refresh();
    } catch (e) {
      this.error = explainFetchError(e, loadApiBaseUrl());
    } finally {
      this.busy = false;
    }
  }

  private selects(): FilterSelectConfig[] {
    const f = this.filter ?? emptyArtifactListFilter();
    const visLabel =
      f.visibility && f.visibility !== "all"
        ? (VISIBILITY_OPTS.find((o) => o.value === f.visibility)?.label ?? "Visibilité")
        : "Visibilité";
    const sortLabel = SORT_OPTS.find((o) => o.value === f.sort)?.label ?? "Ordre";
    return [
      {
        name: "visibility",
        label: "Visibilité",
        triggerLabel: visLabel,
        icon: "eye",
        options: [...VISIBILITY_OPTS],
        value: f.visibility,
        defaultValue: "all",
      },
      {
        name: "sort",
        label: "Ordre",
        triggerLabel: sortLabel,
        icon: "sort",
        options: [...SORT_OPTS],
        value: f.sort,
        defaultValue: "updatedAt",
      },
    ];
  }

  private plural(n: number): string {
    return n === 1 ? "1 artefact" : `${n} artefacts`;
  }

  private onSelect = (e: Event) => {
    const {name, value} = (e as CustomEvent<{name: string; value: string}>).detail;
    set(artifactListFilterKey, {...emptyArtifactListFilter(), ...(this.filter ?? {}), [name]: value});
  };

  private resetFilters() {
    set(artifactListFilterKey, emptyArtifactListFilter());
  }

  private pill(visibility: string) {
    const v = VISIBILITY_LABELS[visibility];
    return html`<span class="pill" data-tone=${visibility} title=${v?.hint ?? ""}
      >${v?.label ?? visibility}</span
    >`;
  }

  private renderSkeleton() {
    return html`
      <div class="panel" aria-hidden="true">
        ${[0, 1, 2, 3].map(
          () => html`<div class="sk-row">
            <span class="skeleton" style="width: min(22rem, 60%)"></span>
            <span class="skeleton" style="width: 4rem"></span>
          </div>`,
        )}
      </div>
    `;
  }

  private renderEmpty(hasItems: boolean) {
    if (hasItems) {
      return html`
        <div class="panel empty">
          <h2>Aucun artefact ne correspond</h2>
          <p>Essayez un autre mot, ou retirez les filtres pour revoir toute la bibliothèque.</p>
          <sonic-button type="button" size="sm" variant="outline" @click=${() => this.resetFilters()}>
            Réinitialiser les filtres
          </sonic-button>
        </div>
      `;
    }
    return html`
      <div class="panel empty">
        <h2>Aucun artefact pour l’instant</h2>
        <p>
          Décrivez ce que vous voulez à l’atelier : l’agent le conçoit, vous le prévisualisez, puis vous
          le publiez. Vous pouvez aussi en publier depuis un client MCP.
        </p>
        <sonic-button type="primary" @click=${() => navigate("/admin/atelier")}>
          <sonic-icon slot="prefix" library="custom" name="chat-bubble" size="sm"></sonic-icon>
          Créer avec l’atelier
        </sonic-button>
      </div>
    `;
  }

  private renderRow(a: ArtifactSummary) {
    const on = this.selected.has(a.id);
    return html`
      <tr data-selected=${on ? "true" : "false"}>
        <td class="c-check">
          <label class="check">
            <input
              type="checkbox"
              .checked=${on}
              @change=${(e: Event) => this.toggle(a.id, (e.target as HTMLInputElement).checked)}
              aria-label=${`Sélectionner ${a.title}`}
            />
          </label>
        </td>
        <td class="c-title">
          <a
            class="title"
            href=${`/admin/${a.slug}/edit`}
            @click=${(e: Event) => {
              e.preventDefault();
              navigate(`/admin/${a.slug}/edit`);
            }}
            >${a.title}</a
          >
          <code class="slug">${a.slug}</code>
          <span class="meta-m">
            ${this.pill(a.visibility)}
            <span class="num">v${a.currentVersion}</span>
            <time datetime=${a.updatedAt} title=${fullDate(a.updatedAt)}>${relativeTime(a.updatedAt)}</time>
          </span>
        </td>
        <td class="c-vis">${this.pill(a.visibility)}</td>
        <td class="c-ver num">v${a.currentVersion}</td>
        <td class="c-date">
          <time datetime=${a.updatedAt} title=${fullDate(a.updatedAt)}>${relativeTime(a.updatedAt)}</time>
        </td>
        <td class="c-act">${this.renderActions(a)}</td>
      </tr>
    `;
  }

  render() {
    const account = loadArtifactsAccount();
    if (!account) {
      return html`
        <div class="page page-narrow">
          <h1>Bibliothèque</h1>
          <div class="panel empty">
            <h2>Connectez-vous pour gérer vos artefacts</h2>
            <p>Votre bibliothèque est liée à votre compte Tadaaa.</p>
            <sonic-button type="primary" @click=${() => this.login()}>
              <sonic-icon slot="prefix" library="custom" name="log-in" size="sm"></sonic-icon>
              Se connecter avec Tadaaa
            </sonic-button>
          </div>
        </div>
      `;
    }

    const rows = this.filtered();
    const allOn = rows.length > 0 && rows.every((r) => this.selected.has(r.id));
    const selCount = this.selected.size;
    const count = this.loading
      ? "Chargement…"
      : rows.length === this.items.length
        ? this.plural(rows.length)
        : `${rows.length} sur ${this.plural(this.items.length)}`;

    return html`
      <div
        class="page"
        formDataProvider=${artifactListFilterKey.path}
        dataFilterProvider=${artifactListFilterKey.path}
      >
        <div class="page-head">
          <div class="titles">
            <h1>Bibliothèque</h1>
            <p class="sub" aria-live="polite">${count}</p>
          </div>
          <div class="actions">
            <sonic-button
              class="refresh"
              type="button"
              variant="ghost"
              size="sm"
              ?disabled=${this.loading}
              title="Actualiser"
              aria-label="Actualiser la liste"
              @click=${() => this.refresh()}
            >
              <sonic-icon library="custom" name="refresh" size="sm"></sonic-icon>
            </sonic-button>
            <sonic-button type="primary" @click=${() => navigate("/admin/atelier")}>
              <sonic-icon slot="prefix" library="custom" name="chat-bubble" size="sm"></sonic-icon>
              Créer avec l’atelier
            </sonic-button>
          </div>
        </div>

        ${this.items.length || this.loading
          ? html`<artifact-filter-bar
              searchPlaceholder="Titre, slug ou description…"
              .selects=${this.selects()}
              @select-change=${this.onSelect}
            ></artifact-filter-bar>`
          : nothing}
        ${this.error
          ? html`<div class="notice" data-tone="danger" role="alert">
              <sonic-icon library="custom" name="warning-triangle" size="sm"></sonic-icon>
              <span class="grow">${this.error}</span>
              <sonic-button size="xs" variant="outline" @click=${() => this.refresh()}
                >Réessayer</sonic-button
              >
            </div>`
          : nothing}
        ${this.loading
          ? this.renderSkeleton()
          : rows.length === 0 && !this.error
            ? this.renderEmpty(this.items.length > 0)
            : rows.length === 0
              ? nothing
              : html`
                  <div class="panel list">
                    ${selCount
                      ? html`<div class="selbar" role="status">
                          <span class="num">${selCount} sélectionné${selCount > 1 ? "s" : ""}</span>
                          ${allOn
                            ? nothing
                            : html`<sonic-button
                                size="xs"
                                variant="ghost"
                                @click=${() => this.toggleAll(rows, true)}
                                >Tout sélectionner</sonic-button
                              >`}
                          <sonic-button size="xs" variant="ghost" @click=${() => this.toggleAll(rows, false)}
                            >Désélectionner</sonic-button
                          >
                          <span class="grow"></span>
                          <sonic-button
                            size="sm"
                            variant="outline"
                            ?disabled=${this.busy}
                            @click=${() => this.removeSelected()}
                          >
                            <sonic-icon slot="prefix" library="custom" name="trash" size="sm"></sonic-icon>
                            Supprimer
                          </sonic-button>
                        </div>`
                      : nothing}
                    <table>
                      <thead>
                        <tr>
                          <th class="c-check">
                            <label class="check">
                              <input
                                type="checkbox"
                                .checked=${allOn}
                                @change=${(e: Event) =>
                                  this.toggleAll(rows, (e.target as HTMLInputElement).checked)}
                                aria-label="Tout sélectionner"
                              />
                            </label>
                          </th>
                          <th class="c-title">Titre</th>
                          <th class="c-vis">Visibilité</th>
                          <th class="c-ver">Version</th>
                          <th class="c-date">Modifié</th>
                          <th class="c-act"><span class="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        ${repeat(rows, (a) => a.id, (a) => this.renderRow(a))}
                      </tbody>
                    </table>
                  </div>
                `}
        <p class="${this.copiedId ? "toast" : "sr-only"}" role="status">
          ${this.copiedId ? "Lien copié dans le presse-papiers" : ""}
        </p>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "artifact-library-page": ArtifactLibraryPage;
  }
}
