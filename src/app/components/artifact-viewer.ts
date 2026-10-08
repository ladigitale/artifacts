import "@supersoniks/concorde/button";
import "@supersoniks/concorde/sdui";
import "./artifact-a2ui-view";
import {agentStackLibrary, injectAgentStackStyles} from "@ladigitale/agent-stack/libraries";
import type {A2uiServerMessage} from "@ladigitale/agent-stack/a2ui";
import {html, LitElement, nothing} from "lit";
import {customElement, property, state} from "lit/decorators.js";
import {
  fetchPublicArtifact,
  ApiError,
  fetchPublicCollection,
  type PublicArtifact,
} from "../cloud/client";
import {explainFetchError, loadApiBaseUrl} from "../cloud/api-base";
import {docCapabilities, guardDocument} from "../sdui-guard";
import {applySafeTransforms} from "../jsonata-safe";
import {loadScriptAssets} from "../script-loader";
import {ensureAddonsFor} from "../addons";
import {startSinks, type SinkDef} from "../sinks";
import {applyDocFonts} from "../doc-fonts";
import {claimNamespace, transformDocument, type NamespaceClaim} from "../doc-transform";
import {declaredNames, nsName, nsTree, nsValue} from "../dp-namespace";
import {dp, set} from "@supersoniks/concorde/utils";
import tailwind from "../../css/tailwind";

/** Une vue porte soit `root` (descripteur SDUI), soit `a2ui` (messages A2UI v0.9). */
type ViewDef = {
  id: string;
  title: string;
  root?: Record<string, unknown>;
  a2ui?: A2uiServerMessage[];
  /** Store du document qui reçoit les actions A2UI. */
  actionStore?: string;
  hidden?: boolean;
};

/**
 * Libraries agent-stack (`a2ui:*`, `chat:*`) disponibles dans toutes les vues SDUI.
 * Ajoutées avant `transformDocument` pour que l'embed réécrive aussi leurs tagNames ;
 * une entrée du document du même nom l'emporte.
 */
function withAgentLibraries(doc: Record<string, unknown>): Record<string, unknown> {
  const views = (doc as {views?: ViewDef[]}).views;
  if (!Array.isArray(views)) return doc;
  return {
    ...doc,
    views: views.map((v) =>
      v?.root && typeof v.root === "object"
        ? {
            ...v,
            root: {
              ...v.root,
              library: {...agentStackLibrary, ...((v.root as {library?: object}).library ?? {})},
            },
          }
        : v,
    ),
  };
}
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
  /**
   * Intégré dans une page tiers (embed.js) : jamais d'accès à l'URL de l'hôte
   * (ni `?k=` / `?rk=`, ni `#vue`, ni `history`) ; les vues changent en interne.
   */
  @property({type: Boolean}) embedded = false;
  /** Embed : jeton de lien (`k`) d'un artefact « lien ». */
  @property({type: String, attribute: "link-key"}) linkKey = "";
  /** Embed : lien secret de lecture (`rk`) des collections. */
  @property({type: String, attribute: "read-key"}) readKeyValue = "";
  /** Embed : vue affichée au démarrage (sinon `defaultView`). */
  @property({type: String}) view = "";

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
  /** Préfixe des DataProviders (vide sauf collision entre artefacts intégrés). */
  private ns = "";
  private nsNames = new Set<string>();
  private nsClaim: NamespaceClaim | null = null;
  private rootCache = new Map<string, Record<string, unknown>>();

  /** Nom effectif d'un DataProvider / store du document. */
  private n(name: string): string {
    return nsName(this.ns, name);
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.embedded) {
      this.addEventListener("click", this.onEmbeddedClick);
    } else {
      window.addEventListener("hashchange", this.onHash);
    }
    void this.load();
  }

  disconnectedCallback() {
    window.removeEventListener("hashchange", this.onHash);
    this.removeEventListener("click", this.onEmbeddedClick);
    this.clearTransformWatchers();
    this.clearLiveData();
    this.releaseNamespace();
    applyDocFonts(null);
    super.disconnectedCallback();
  }

  private onHash = () => {
    this.syncViewFromHash();
  };

  /**
   * Embed : un lien interne `#vue` change de vue sans toucher au hash de la page hôte.
   * `composedPath` traverse les shadow roots (sonic-link, sonic-button…).
   */
  private onEmbeddedClick = (e: Event) => {
    const views = (this.data?.document as {views?: ViewDef[]} | undefined)?.views ?? [];
    for (const el of e.composedPath()) {
      if (!(el instanceof Element)) continue;
      const href = el.getAttribute("href");
      if (!href?.startsWith("#")) continue;
      const id = href.slice(1);
      if (!views.some((v) => v.id === id)) return;
      e.preventDefault();
      this.goView(id);
      return;
    }
  };

  private linkToken(): string | null {
    if (this.embedded) return this.linkKey || null;
    return new URLSearchParams(location.search).get("k");
  }

  /** Lien secret de lecture (`rk`) pour les collections non publiques. */
  private readKey(): string | null {
    if (this.embedded) return this.readKeyValue || null;
    return new URLSearchParams(location.search).get("rk");
  }

  private clearLiveData() {
    this.refreshTimers.forEach((t) => clearInterval(t));
    this.refreshTimers = [];
    this.stopSinks?.();
    this.stopSinks = null;
  }

  private releaseNamespace() {
    this.nsClaim?.release();
    this.nsClaim = null;
    this.ns = "";
    this.nsNames = new Set();
    this.rootCache.clear();
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
      const fetched = await fetchPublicArtifact(this.slug, this.linkToken());
      this.data = {...fetched, document: transformDocument(withAgentLibraries(fetched.document))};
      this.releaseNamespace();
      this.nsNames = declaredNames(this.data.document, this.slug);
      this.nsClaim = claimNamespace(this.slug, this.nsNames);
      this.ns = this.nsClaim.ns;
      this.guardErrors = guardDocument(this.data.document);
      applyDocFonts(this.guardErrors.length ? null : (this.data.document as {fonts?: unknown}).fonts);
      this.syncViewFromHash();
      const doc = this.data.document as {
        data?: {stores?: Record<string, StoreDef>};
      };
      this.docStores = doc.data?.stores ?? {};
      if (!this.guardErrors.length) {
        await Promise.all([loadScriptAssets(this.data.scriptAssets), ensureAddonsFor(this.data.document)]);
        this.scriptsReady = true;
        await this.applyDataProviders();
        const sinks = (this.data.document as {data?: {sinks?: Record<string, SinkDef>}}).data?.sinks;
        this.stopSinks = startSinks(this.slug, this.linkToken(), this.nsSinks(sinks));
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
    const hash = this.embedded ? this.viewId || this.view : location.hash.replace(/^#/, "");
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
      set(this.n(name), value);
      set(this.n(`artifact:${this.slug}:transform:${name}`), value);
    }
  }

  private watchSource(name: string) {
    try {
      const provider = dp(this.n(name)) as {
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
      set(this.n(name), {member: items});
      set(this.n(collection), {member: items});
      set(this.n(`artifact:${this.slug}:${name}`), {member: items});
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
      set(this.n(name), {member: items});
      set(this.n(collection), {member: items});
      set(this.n(`artifact:${this.slug}:${name}`), {member: items});
      return true;
    } catch (e) {
      // Garde les dernières données ; arrête la relecture si l’accès est refusé.
      return !isDenied(e);
    }
  }

  private currentRoot(): Record<string, unknown> | null {
    const doc = this.data?.document as {views?: ViewDef[]} | undefined;
    const view = doc?.views?.find((v) => v.id === this.viewId);
    if (!view?.root) return null;
    if (!this.ns) return view.root;
    // Même objet d'un rendu à l'autre : sonic-sdui ne reconstruit pas la vue.
    let root = this.rootCache.get(view.id);
    if (!root) {
      root = nsTree(this.ns, this.nsNames, view.root);
      this.rootCache.set(view.id, root);
    }
    return root;
  }

  private nsSinks(sinks: Record<string, SinkDef> | undefined): Record<string, SinkDef> | undefined {
    if (!sinks || !this.ns) return sinks;
    const v = (x: string) => nsValue(this.ns, this.nsNames, x);
    const out: Record<string, SinkDef> = {};
    for (const [name, s] of Object.entries(sinks)) {
      if (!s) continue;
      out[name] = {
        ...s,
        from: typeof s.from === "string" ? v(s.from) : s.from,
        code: typeof s.code === "string" ? v(s.code) : s.code,
        ack: typeof s.ack === "string" ? v(s.ack) : s.ack,
        merge: s.merge
          ? Object.fromEntries(Object.entries(s.merge).map(([k, p]) => [k, typeof p === "string" ? v(p) : p]))
          : s.merge,
      };
    }
    return out;
  }

  private goView(id: string) {
    if (this.embedded) {
      this.viewId = id;
      this.dispatchEvent(new CustomEvent("artifact-view", {detail: {view: id}, bubbles: true, composed: true}));
      return;
    }
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
            id=${this.n(id)}
            dataProvider=${this.n(def.dataProvider || id)}
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

  /** Bandeau : l'artefact peut demander caméra / micro / MIDI / écran (jamais sans un clic de l'utilisateur). */
  private renderCapabilities() {
    const caps = docCapabilities(this.data?.document);
    if (!caps.length) return nothing;
    const label: Record<string, string> = {
      camera: "la caméra",
      microphone: "le micro",
      midi: "vos appareils MIDI",
      screen: "un partage d’écran",
    };
    const names = caps.map((c) => label[c] ?? c);
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}` : names[0];
    return html`<p
      class="artifact-capabilities m-0 mx-3 mt-3 sm:mx-4 px-3 py-2 rounded-md text-sm print:hidden"
      style="background:rgba(127,127,127,.12)"
      role="note"
    >
      Cet artefact peut demander l’accès à ${list}. Rien n’est activé sans votre clic, et vous pourrez refuser.
    </p>`;
  }

  protected firstUpdated() {
    // CSS des libraries agent-stack : les styles du document ne traversent pas le shadow root.
    if (this.renderRoot instanceof ShadowRoot) injectAgentStackStyles(this.renderRoot);
  }

  private currentView(): ViewDef | undefined {
    const doc = this.data?.document as {views?: ViewDef[]} | undefined;
    return doc?.views?.find((v) => v.id === this.viewId);
  }

  private renderBody(root: Record<string, unknown> | null) {
    if (!this.scriptsReady) return html`<p class="opacity-70">Préparation…</p>`;
    const view = this.currentView();
    if (view && Array.isArray(view.a2ui)) {
      return html`<artifact-a2ui-view
        .messages=${view.a2ui}
        .store=${view.actionStore ? this.n(view.actionStore) : ""}
        .prefix=${this.n(`a2ui_${this.slug}_`).replace(/[^\w-]/g, "_")}
      ></artifact-a2ui-view>`;
    }
    return root ? html`<sonic-sdui .props=${root}></sonic-sdui>` : html`<p class="opacity-70">Préparation…</p>`;
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
        ${this.renderCapabilities()}
        <div class="artifact-sdui flex-1 min-h-[12rem] p-3 sm:p-4">
          ${this.renderBody(root)}
        </div>
      </div>
    `;
  }
}

function isDenied(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 404);
}
