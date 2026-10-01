import "@supersoniks/concorde/button";
import "@supersoniks/concorde/sdui";
import {html, LitElement, nothing} from "lit";
import {customElement, property, state} from "lit/decorators.js";
import {
  fetchPublicArtifact,
  fetchPublicCollection,
  type PublicArtifact,
} from "../cloud/client";
import {explainFetchError, loadApiBaseUrl} from "../cloud/api-base";
import {guardDocument} from "../sdui-guard";
import {applySafeTransforms} from "../jsonata-safe";
import {loadScriptAssets} from "../script-loader";
import {set} from "@supersoniks/concorde/utils";
import tailwind from "../../css/tailwind";

type ViewDef = {id: string; title: string; root: Record<string, unknown>};

@customElement("artifact-viewer")
export class ArtifactViewer extends LitElement {
  static styles = [tailwind];

  @property({type: String}) slug = "";

  @state() private data: PublicArtifact | null = null;
  @state() private error = "";
  @state() private guardErrors: {path: string; message: string}[] = [];
  @state() private viewId = "";
  @state() private loading = true;
  @state() private scriptsReady = false;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("hashchange", this.onHash);
    void this.load();
  }

  disconnectedCallback() {
    window.removeEventListener("hashchange", this.onHash);
    super.disconnectedCallback();
  }

  private onHash = () => {
    this.syncViewFromHash();
  };

  private linkToken(): string | null {
    return new URLSearchParams(location.search).get("k");
  }

  private async load() {
    if (!this.slug?.trim()) {
      this.loading = false;
      this.error = "Slug manquant.";
      this.data = null;
      return;
    }
    this.loading = true;
    this.scriptsReady = false;
    this.error = "";
    try {
      this.data = await fetchPublicArtifact(this.slug, this.linkToken());
      this.guardErrors = guardDocument(this.data.document);
      this.syncViewFromHash();
      if (!this.guardErrors.length) {
        await loadScriptAssets(this.data.scriptAssets);
        this.scriptsReady = true;
        await this.applyDataProviders();
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      try {
        const j = JSON.parse(raw) as {detail?: string; title?: string};
        this.error = j.detail || j.title || raw;
      } catch {
        this.error = explainFetchError(e, loadApiBaseUrl());
      }
      this.data = null;
    } finally {
      this.loading = false;
    }
  }

  private syncViewFromHash() {
    const doc = this.data?.document as {
      defaultView?: string;
      views?: ViewDef[];
    } | undefined;
    if (!doc?.views?.length) {
      this.viewId = "";
      return;
    }
    const hash = location.hash.replace(/^#/, "");
    const match = doc.views.find((v) => v.id === hash);
    this.viewId = match?.id ?? doc.defaultView ?? doc.views[0].id;
  }

  private async applyDataProviders() {
    if (!this.data) return;
    const doc = this.data.document as {
      data?: {
        sources?: Record<string, {collection: string}>;
        transforms?: Record<string, {jsonata: string}>;
      };
    };
    const sources = doc.data?.sources ?? {};
    const sourceData: Record<string, unknown> = {};
    const k = this.linkToken();

    // Always try to load collections referenced by sources (even if not in public list yet)
    for (const [name, src] of Object.entries(sources)) {
      const collection = src.collection;
      let member: unknown[] = [];
      try {
        member = await fetchPublicCollection(this.slug, collection, k);
      } catch {
        member = [];
      }
      // JSONata / $count attend un tableau d’items (records ou data)
      const items = member.map((row) => {
        if (row && typeof row === "object" && "data" in row) {
          return (row as {data: unknown}).data;
        }
        return row;
      });
      sourceData[name] = items;
      sourceData[collection] = items;
      // DP court = attribut dataProvider des nœuds SDUI
      set(name, {member: items});
      set(collection, {member: items});
      set(`artifact:${this.slug}:${name}`, {member: items});
    }

    const transforms = applySafeTransforms(sourceData, doc.data?.transforms);
    for (const [name, value] of Object.entries(transforms)) {
      // sonic-value key=… lit le DataProvider nommé comme dataProvider=
      set(name, value);
      set(`artifact:${this.slug}:transform:${name}`, value);
    }
  }

  private currentRoot(): Record<string, unknown> | null {
    const doc = this.data?.document as {views?: ViewDef[]} | undefined;
    const view = doc?.views?.find((v) => v.id === this.viewId);
    return view?.root ?? null;
  }

  private goView(id: string) {
    const k = this.linkToken();
    const q = k ? `?k=${encodeURIComponent(k)}` : "";
    history.replaceState({}, "", `/${this.slug}/${q}#${id}`);
    this.viewId = id;
  }

  render() {
    if (this.loading) return html`<p class="p-4">Chargement…</p>`;
    if (this.error) {
      return html`<div class="p-4 flex flex-col gap-2">
        <h1 class="text-xl m-0">Impossible d’afficher l’artefact</h1>
        <p class="text-red-600 m-0">${this.error}</p>
      </div>`;
    }
    if (!this.data) return nothing;
    if (this.guardErrors.length) {
      return html`<div class="p-4 flex flex-col gap-2">
        <h1 class="text-xl m-0">Document refusé</h1>
        <ul class="m-0">
          ${this.guardErrors.map(
            (e) => html`<li><code>${e.path}</code> — ${e.message}</li>`,
          )}
        </ul>
        ${this.data.canWrite
          ? html`<p class="text-sm opacity-70">Corrigez le document et republiez.</p>`
          : nothing}
      </div>`;
    }
    const doc = this.data.document as {views?: ViewDef[]};
    const root = this.currentRoot();
    const views = doc.views ?? [];
    return html`
      <div class="artifact-bare flex flex-col min-h-full">
        ${views.length > 1
          ? html`
              <nav class="flex flex-wrap gap-2 p-3 print:hidden" aria-label="Vues">
                ${views.map(
                  (v) => html`
                    <sonic-button
                      type="button"
                      size="sm"
                      variant=${v.id === this.viewId ? "default" : "outline"}
                      @click=${() => this.goView(v.id)}
                      >${v.title}</sonic-button
                    >
                  `,
                )}
              </nav>
            `
          : nothing}
        <div class="artifact-sdui flex-1 min-h-[12rem] p-3 sm:p-4">
          ${root && this.scriptsReady
            ? html`<sonic-sdui .props=${root}></sonic-sdui>`
            : html`<p class="opacity-70">Préparation…</p>`}
        </div>
      </div>
    `;
  }
}
