import "@supersoniks/concorde/button";
import "@supersoniks/concorde/interactive";
import "@supersoniks/concorde/sdui";
import {html, LitElement, nothing} from "lit";
import {customElement, property, state} from "lit/decorators.js";
import {
  fetchPublicArtifact,
  ApiError,
  fetchPublicCollection,
  type PublicArtifact,
} from "../cloud/client";
import {explainFetchError, loadApiBaseUrl} from "../cloud/api-base";
import {guardDocument} from "../sdui-guard";
import {applySafeTransforms} from "../jsonata-safe";
import {loadScriptAssets} from "../script-loader";
import {startSinks, type SinkDef} from "../sinks";
import {applyDocFonts} from "../doc-fonts";
import {dp, set} from "@supersoniks/concorde/utils";
import tailwind from "../../css/tailwind";

type ViewDef = {id: string; title: string; root: Record<string, unknown>; hidden?: boolean};
type StoreDef = {
  initial?: unknown;
  reducer?: string;
  dataProvider?: string;
  history?: number;
  budgetMs?: number;
  bootAction?: string;
};

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
  @state() private docStores: Record<string, StoreDef> = {};

  private sourceData: Record<string, unknown> = {};
  private transformUnsubs: Array<() => void> = [];
  private refreshTimers: number[] = [];
  private stopSinks: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("hashchange", this.onHash);
    void this.load();
  }

  disconnectedCallback() {
    window.removeEventListener("hashchange", this.onHash);
    this.clearTransformWatchers();
    this.clearLiveData();
    applyDocFonts(null);
    super.disconnectedCallback();
  }

  private onHash = () => {
    this.syncViewFromHash();
  };

  private linkToken(): string | null {
    return new URLSearchParams(location.search).get("k");
  }

  /** Lien secret de lecture (`rk`) pour les collections non publiques. */
  private readKey(): string | null {
    return new URLSearchParams(location.search).get("rk");
  }

  private clearLiveData() {
    this.refreshTimers.forEach((t) => clearInterval(t));
    this.refreshTimers = [];
    this.stopSinks?.();
    this.stopSinks = null;
  }

  private clearTransformWatchers() {
    for (const off of this.transformUnsubs) {
      try {
        off();
      } catch {
        /* ignore */
      }
    }
    this.transformUnsubs = [];
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
    this.clearTransformWatchers();
    this.clearLiveData();
    try {
      this.data = await fetchPublicArtifact(this.slug, this.linkToken());
      this.guardErrors = guardDocument(this.data.document);
      applyDocFonts(this.guardErrors.length ? null : (this.data.document as {fonts?: unknown}).fonts);
      this.syncViewFromHash();
      const doc = this.data.document as {
        data?: {stores?: Record<string, StoreDef>};
      };
      this.docStores = doc.data?.stores ?? {};
      if (!this.guardErrors.length) {
        await loadScriptAssets(this.data.scriptAssets);
        this.scriptsReady = true;
        await this.applyDataProviders();
        const sinks = (this.data.document as {data?: {sinks?: Record<string, SinkDef>}}).data?.sinks;
        this.stopSinks = startSinks(this.slug, this.linkToken(), sinks);
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

  private transformRun = 0;

  private async publishTransforms() {
    if (!this.data) return;
    const run = ++this.transformRun;
    const doc = this.data.document as {
      data?: {transforms?: Record<string, {jsonata: string}>};
    };
    const transforms = await applySafeTransforms(this.sourceData, doc.data?.transforms);
    // Une source a pu changer pendant l’évaluation : seule la dernière publie.
    if (run !== this.transformRun) return;
    for (const [name, value] of Object.entries(transforms)) {
      set(name, value);
      set(`artifact:${this.slug}:transform:${name}`, value);
    }
  }

  private watchSource(name: string) {
    try {
      const provider = dp(name) as {
        onAssign?: (cb: (v: unknown) => void) => void;
        offAssign?: (cb: (v: unknown) => void) => void;
      };
      const cb = (v: unknown) => {
        const items =
          v && typeof v === "object" && Array.isArray((v as {member?: unknown}).member)
            ? (v as {member: unknown[]}).member
            : Array.isArray(v)
              ? v
              : [];
        this.sourceData[name] = items;
        void this.publishTransforms();
      };
      if (typeof provider.onAssign === "function") {
        provider.onAssign(cb);
        this.transformUnsubs.push(() => provider.offAssign?.(cb));
      }
    } catch {
      /* ignore */
    }
  }

  private async applyDataProviders() {
    if (!this.data) return;
    const doc = this.data.document as {
      data?: {
        sources?: Record<string, {collection: string; refresh?: number}>;
        transforms?: Record<string, {jsonata: string}>;
      };
    };
    const sources = doc.data?.sources ?? {};
    this.sourceData = {};
    const k = this.linkToken();
    const rk = this.readKey();

    for (const [name, src] of Object.entries(sources)) {
      const collection = src.collection;
      let member: unknown[] = [];
      let denied = false;
      try {
        member = await fetchPublicCollection(this.slug, collection, k, rk);
      } catch (e) {
        member = [];
        denied = isDenied(e);
      }
      const items = member.map((row) => {
        if (row && typeof row === "object" && "data" in row) {
          return (row as {data: unknown}).data;
        }
        return row;
      });
      this.sourceData[name] = items;
      this.sourceData[collection] = items;
      set(name, {member: items});
      set(collection, {member: items});
      set(`artifact:${this.slug}:${name}`, {member: items});
      this.watchSource(name);
      const every = Number(src.refresh);
      // Pas de relecture si l’accès est refusé (élève sans lien secret) : toute une classe
      // derrière la même IP épuiserait la limite de requêtes.
      if (!denied && Number.isFinite(every) && every >= 5) {
        const timer = window.setInterval(async () => {
          if (await this.refreshSource(name, collection)) return;
          clearInterval(timer);
        }, Math.min(every, 3600) * 1000);
        this.refreshTimers.push(timer);
      }
    }

    await this.publishTransforms();
  }

  /** Relecture périodique (`sources.<x>.refresh`, en secondes) — onglet visible seulement. */
  private async refreshSource(name: string, collection: string): Promise<boolean> {
    if (document.hidden) return true;
    try {
      const member = await fetchPublicCollection(this.slug, collection, this.linkToken(), this.readKey());
      const items = member.map((row) =>
        row && typeof row === "object" && "data" in row ? (row as {data: unknown}).data : row,
      );
      set(name, {member: items});
      set(collection, {member: items});
      set(`artifact:${this.slug}:${name}`, {member: items});
      return true;
    } catch (e) {
      // Garde les dernières données ; arrête la relecture si l’accès est refusé.
      return !isDenied(e);
    }
  }

  private currentRoot(): Record<string, unknown> | null {
    const doc = this.data?.document as {views?: ViewDef[]} | undefined;
    const view = doc?.views?.find((v) => v.id === this.viewId);
    return view?.root ?? null;
  }

  private goView(id: string) {
    const params = new URLSearchParams();
    const k = this.linkToken();
    const rk = this.readKey();
    if (k) params.set("k", k);
    if (rk) params.set("rk", rk);
    const q = params.toString() ? `?${params}` : "";
    history.replaceState({}, "", `/${this.slug}/${q}#${id}`);
    this.viewId = id;
  }

  private renderDocStores() {
    const entries = Object.entries(this.docStores);
    if (!entries.length) return nothing;
    return html`
      <div class="sr-only" aria-hidden="true">
        ${entries.map(([id, def]) => {
          const initial =
            def.initial == null
              ? "{}"
              : typeof def.initial === "string"
                ? def.initial
                : JSON.stringify(def.initial);
          return html`<sonic-store
            id=${id}
            dataProvider=${def.dataProvider || id}
            initial=${initial}
            reducer=${def.reducer ?? ""}
            history=${def.history ?? 0}
            budget-ms=${def.budgetMs ?? 8}
            boot-action=${def.bootAction ?? ""}
          ></sonic-store>`;
        })}
      </div>
    `;
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
    // Vues `hidden` : hors onglets, accessibles seulement par leur #id.
    const views = (doc.views ?? []).filter((v) => v.hidden !== true);
    return html`
      <div class="artifact-bare flex flex-col min-h-full">
        ${this.renderDocStores()}
        ${views.length > 1
          ? html`
              <nav
                class="artifact-nav flex flex-wrap gap-2 p-3 print:hidden"
                aria-label="Vues"
              >
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

function isDenied(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 404);
}
