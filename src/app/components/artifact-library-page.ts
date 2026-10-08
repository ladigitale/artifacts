import "@supersoniks/concorde/button";
import "@supersoniks/concorde/icon";
import "@supersoniks/concorde/badge";
import "@supersoniks/concorde/checkbox";
import "@supersoniks/concorde/pop";
import "@supersoniks/concorde/menu";
import "@supersoniks/concorde/menu-item";
import "@supersoniks/concorde/divider";
import "@supersoniks/concorde/tooltip";
import {html, LitElement, nothing} from "lit";
import {customElement, state} from "lit/decorators.js";
import {subscribe} from "@supersoniks/concorde/decorators";
import {dp, set} from "@supersoniks/concorde/utils";
import tailwind from "../../css/tailwind";
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

@customElement("artifact-library-page")
export class ArtifactLibraryPage extends LitElement {
  static styles = [tailwind];

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
      <sonic-pop class="inline-block" placement="bottom-end" shadow="sm">
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
          <sonic-menu-item @click=${() => this.openArtifact(a)}>
            ${this.menuIcon("open-new-window")} Ouvrir l’artefact
          </sonic-menu-item>
          <sonic-menu-item @click=${() => this.copyLink(a)}>
            ${this.menuIcon(copied ? "check" : "copy")}
            ${copied ? "Lien copié" : "Copier le lien"}
          </sonic-menu-item>
          <sonic-menu-item @click=${() => navigate(`/admin/${a.slug}/edit`)}>
            ${this.menuIcon("edit-pencil")} Modifier
          </sonic-menu-item>
          <sonic-menu-item @click=${() => navigate(`/admin/${a.slug}/atelier`)}>
            ${this.menuIcon("chat-bubble")} Modifier avec l’atelier
          </sonic-menu-item>
          <sonic-menu-item @click=${() => navigate(`/admin/${a.slug}/versions`)}>
            ${this.menuIcon("clock")} Historique des versions
          </sonic-menu-item>
          <sonic-divider size="xs"></sonic-divider>
          <sonic-menu-item
            type="danger"
            ?disabled=${this.busy}
            @click=${() => this.removeOne(a)}
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
      VISIBILITY_OPTS.find((o) => o.value === f.visibility)?.label ?? "Visibilité";
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

  render() {
    const account = loadArtifactsAccount();
    if (!account) {
      return html`
        <div class="flex flex-col gap-4 max-w-md">
          <h1 class="text-2xl font-semibold m-0">Bibliothèque</h1>
          <p class="opacity-80 m-0">Connectez-vous pour gérer vos artefacts.</p>
          <sonic-button type="button" @click=${() => this.login()}>
            Se connecter avec Tadaaa
          </sonic-button>
        </div>
      `;
    }

    const rows = this.filtered();
    const allOn = rows.length > 0 && rows.every((r) => this.selected.has(r.id));
    const selCount = this.selected.size;

    return html`
      <div
        class="flex flex-col gap-4"
        formDataProvider=${artifactListFilterKey.path}
        dataFilterProvider=${artifactListFilterKey.path}
      >
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 class="text-2xl font-semibold m-0">Bibliothèque</h1>
            <p class="opacity-70 m-0 text-sm">
              ${this.loading ? "Chargement…" : `${rows.length} artefact(s)`}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <sonic-button type="button" size="sm" @click=${() => navigate("/admin/atelier")}>
              Créer avec l’atelier
            </sonic-button>
            <sonic-button type="button" size="sm" variant="outline" @click=${() => this.refresh()}>
              <sonic-icon slot="prefix" library="custom" name="refresh" size="sm"></sonic-icon>
              Actualiser
            </sonic-button>
          </div>
        </div>

        <artifact-filter-bar
          searchPlaceholder="Titre ou slug…"
          .selects=${this.selects()}
        ></artifact-filter-bar>

        ${selCount
          ? html`
              <div
                class="flex flex-wrap items-center gap-2 p-2 rounded border border-current/15"
              >
                <span class="text-sm">${selCount} sélectionné(s)</span>
                <sonic-button
                  type="button"
                  size="sm"
                  variant="outline"
                  ?disabled=${this.busy}
                  @click=${() => this.removeSelected()}
                >
                  <sonic-icon
                    slot="prefix"
                    library="custom"
                    name="trash"
                    size="sm"
                  ></sonic-icon>
                  Supprimer
                </sonic-button>
              </div>
            `
          : nothing}

        ${this.error ? html`<p class="text-red-600 m-0">${this.error}</p>` : nothing}

        ${!this.loading && rows.length === 0
          ? html`
              <div class="opacity-70 flex flex-col gap-2 py-8">
                <p class="m-0">Aucun artefact. Publiez-en un via MCP.</p>
              </div>
            `
          : html`
              <div class="overflow-x-auto">
                <table class="w-full text-sm border-collapse">
                  <thead>
                    <tr class="text-left border-b border-current/15">
                      <th class="p-2 w-10">
                        <input
                          type="checkbox"
                          .checked=${allOn}
                          @change=${(e: Event) =>
                            this.toggleAll(rows, (e.target as HTMLInputElement).checked)}
                          aria-label="Tout sélectionner"
                        />
                      </th>
                      <th class="p-2">Titre</th>
                      <th class="p-2">Visibilité</th>
                      <th class="p-2 hidden sm:table-cell">Version</th>
                      <th class="p-2 hidden md:table-cell">Modifié</th>
                      <th class="p-2 text-right"><span class="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows.map(
                      (a) => html`
                        <tr class="border-b border-current/10 align-middle">
                          <td class="p-2">
                            <input
                              type="checkbox"
                              .checked=${this.selected.has(a.id)}
                              @change=${(e: Event) =>
                                this.toggle(a.id, (e.target as HTMLInputElement).checked)}
                              aria-label=${`Sélectionner ${a.title}`}
                            />
                          </td>
                          <td class="p-2">
                            <a
                              class="font-medium text-inherit no-underline hover:underline cursor-pointer"
                              href=${`/admin/${a.slug}/edit`}
                              @click=${(e: Event) => {
                                e.preventDefault();
                                navigate(`/admin/${a.slug}/edit`);
                              }}
                              >${a.title}</a
                            >
                            <div class="opacity-60 text-xs break-all">${a.slug}</div>
                          </td>
                          <td class="p-2">
                            <sonic-badge variant="outline" size="sm">${a.visibility}</sonic-badge>
                          </td>
                          <td class="p-2 hidden sm:table-cell">v${a.currentVersion}</td>
                          <td class="p-2 opacity-70 whitespace-nowrap hidden md:table-cell">
                            ${a.updatedAt?.slice?.(0, 16)?.replace("T", " ") ?? a.updatedAt}
                          </td>
                          <td class="p-1 text-right w-12">
                            ${this.renderActions(a)}
                          </td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
              </div>
            `}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "artifact-library-page": ArtifactLibraryPage;
  }
}
