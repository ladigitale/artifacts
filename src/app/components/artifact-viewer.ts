import "@supersoniks/concorde/button";
import "@supersoniks/concorde/menu";
import "@supersoniks/concorde/menu-item";
import "@supersoniks/concorde/sdui";
import "./artifact-a2ui-view";
import {agentStackLibrary, injectAgentStackStyles} from "@ladigitale/agent-stack/libraries";
import type {A2uiServerMessage} from "@ladigitale/agent-stack/a2ui";
import {html, LitElement, nothing} from "lit";
import {customElement, property, state} from "lit/decorators.js";
import {
  fetchPublicArtifact,
  ApiError,
  fetchAssetJson,
  fetchPublicCollection,
  type PublicArtifact,
} from "../cloud/client";
import {explainFetchError, loadApiBaseUrl} from "../cloud/api-base";
import {docCapabilities, docMlOrigins, guardDocument} from "../sdui-guard";
import {applySafeTransforms} from "../jsonata-safe";
import {loadScriptAssets} from "../script-loader";
import {ensureAddonsFor} from "../addons";
import {startSinks, type SinkDef} from "../sinks";
import {runFromLocation, startIoRun, type IoDef, type IoStatus} from "../io-run";
import {applyDocFontFiles, applyDocFonts} from "../doc-fonts";
import {claimNamespace, transformDocument, type NamespaceClaim} from "../doc-transform";
import {withRoomContext} from "../room-context";
import {VIEW_DP, declaredNames, nsName, nsTree, nsValue} from "../dp-namespace";
import {dp, set} from "@supersoniks/concorde/utils";
import DataBindObserver from "@supersoniks/concorde/core/utils/DataBindObserver";
import tailwind from "../../css/tailwind";
import {pageFrame, paddingClass} from "../page-frame";

/** Une vue porte soit `root` (descripteur SDUI), soit `a2ui` (messages A2UI v0.9). */
type ViewDef = {
  id: string;
  title: string;
  root?: Record<string, unknown>;
  a2ui?: A2uiServerMessage[];
  /** Store du document qui reçoit les actions A2UI. */
  actionStore?: string;
  /** Chemin A2UI → store dont l'état est recopié dans le data model des surfaces. */
  a2uiBindings?: Record<string, string>;
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
  /**
   * Concorde n'active `data-bind` (`::prop`) que dans le document et dans le shadow root de SES
   * composants : le rendu d'un artefact vit dans celui du viewer, il faut l'observer ici, sinon les
   * gabarits de sonic-list (::text-content, ::href, ::payload…) restent inertes.
   */
  protected createRenderRoot() {
    const root = super.createRenderRoot();
    DataBindObserver.observe(root as unknown as HTMLElement);
    return root;
  }

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
  /**
   * Aperçu (atelier) : document à afficher tel quel, sans appel à l'API. Les collections
   * sont vides et rien n'est envoyé (pas de sinks) ; à utiliser avec `embedded`.
   */
  @property({attribute: false}) previewDocument: Record<string, unknown> | null = null;
  /** Embed : run serveur (contrat `io`) dont l'entrée est lue puis la sortie publiée. */
  @property({type: String}) run = "";
  /** Embed : jeton du run. */
  @property({type: String, attribute: "run-token"}) runToken = "";
  /** Embed : entrée locale du contrat `io` (JSON), sans run serveur. */
  @property({type: String}) input = "";

  @state() private data: PublicArtifact | null = null;
  @state() private error = "";
  @state() private guardErrors: {path: string; message: string}[] = [];
  @state() private viewId = "";
  @state() private loading = true;
  @state() private scriptsReady = false;
  @state() private docStores: Record<string, StoreDef> = {};
  @state() private ioStatus: IoStatus | null = null;

  private sourceData: Record<string, unknown> = {};
  private transformUnsubs: Array<() => void> = [];
  /** Désabonnement du DataProvider des vues (`artifactView`). */
  private viewUnsub: (() => void) | null = null;
  private refreshTimers: number[] = [];
  private stopSinks: (() => void) | null = null;
  private stopIo: (() => void) | null = null;
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
    // Ancres internes (`#programme` vers l'id d'un élément, pas d'une vue) : dans les deux modes.
    this.addEventListener("click", this.onAnchorClick);
    if (this.embedded) {
      this.addEventListener("click", this.onEmbeddedClick);
    } else {
      window.addEventListener("hashchange", this.onHash);
    }
    void this.load();
  }

  disconnectedCallback() {
    window.removeEventListener("hashchange", this.onHash);
    this.removeEventListener("click", this.onAnchorClick);
    this.removeEventListener("click", this.onEmbeddedClick);
    this.clearTransformWatchers();
    this.viewUnsub?.();
    this.viewUnsub = null;
    this.clearLiveData();
    this.releaseNamespace();
    applyDocFonts(null);
    applyDocFontFiles(null);
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

  /**
   * Lien `#id` qui ne désigne pas une vue : défile jusqu'à l'élément de même `id` dans la vue
   * courante (le contenu est dans le shadow DOM du viewer : le navigateur ne le trouve pas seul).
   * Le hash n'est pas modifié : il reste celui de la vue.
   */
  private onAnchorClick = (e: Event) => {
    const views = (this.data?.document as {views?: ViewDef[]} | undefined)?.views ?? [];
    for (const el of e.composedPath()) {
      if (!(el instanceof Element)) continue;
      const href = el.getAttribute("href");
      if (!href?.startsWith("#") || href.length < 2) continue;
      const id = decodeURIComponent(href.slice(1));
      if (views.some((v) => v.id === id)) return;
      if (this.scrollToAnchor(id)) e.preventDefault();
      return;
    }
  };

  /** Défile jusqu'à l'élément `id` du contenu rendu (shadow roots compris). */
  private scrollToAnchor(id: string): boolean {
    const find = (root: ParentNode): Element | null => {
      const direct = root.querySelector(`[id="${CSS.escape(id)}"]`);
      if (direct) return direct;
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) {
          const hit = find(el.shadowRoot);
          if (hit) return hit;
        }
      }
      return null;
    };
    const target = find(this.renderRoot);
    if (!target) return false;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({behavior: reduce ? "auto" : "smooth", block: "start"});
    return true;
  }

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
    this.stopIo?.();
    this.stopIo = null;
    this.ioStatus = null;
  }

  /**
   * Contrat `io` : entrée d'un run (`?run=&rt=` sur la page, `run` / `run-token` ou `input` en
   * embed) envoyée au store, sortie émise (`artifact-output`) et publiée quand `when` est vraie.
   */
  private startIo() {
    const io = (this.data?.document as {io?: IoDef} | undefined)?.io;
    if (!io?.output?.from) return;
    const run = this.embedded
      ? this.run && this.runToken
        ? {id: this.run, token: this.runToken}
        : null
      : runFromLocation(location.search);
    let input: unknown = undefined;
    if (!run && this.embedded && this.input) {
      try {
        input = JSON.parse(this.input);
      } catch {
        this.ioStatus = {state: "error", message: "Attribut input : JSON invalide."};
        return;
      }
    }
    if (!run && input === undefined) return;
    this.stopIo = startIoRun({
      slug: this.slug,
      io,
      run,
      input,
      resolve: (name) => this.n(name),
      onStatus: (s) => {
        // En embed local, pas de bandeau : la page hôte reçoit l'événement.
        this.ioStatus = run || s.state === "error" ? s : null;
      },
      onOutput: (output, runId) => {
        this.dispatchEvent(
          new CustomEvent("artifact-output", {detail: {output, runId, slug: this.slug}, bubbles: true, composed: true}),
        );
      },
    });
  }

  /** Bandeau d'une tâche (run) en cours : la personne sait que son résultat sera transmis. */
  private renderIoStatus() {
    const s = this.ioStatus;
    if (!s) return nothing;
    const text =
      s.state === "waiting"
        ? "Tâche en cours : le résultat sera transmis automatiquement une fois terminé."
        : s.state === "sending"
          ? "Envoi du résultat…"
          : s.state === "done"
            ? "Résultat transmis, vous pouvez fermer cette page."
            : s.message;
    return html`<p
      class="artifact-io-status m-0 mx-3 mt-3 sm:mx-4 px-3 py-2 rounded-md text-sm print:hidden"
      style="background:rgba(127,127,127,.12)"
      role="status"
      aria-live="polite"
      data-state=${s.state}
    >
      ${text}
    </p>`;
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

  protected updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has("previewDocument") && changed.get("previewDocument") !== undefined) void this.load();
    if (changed.has("viewId") && this.viewId) this.publishView(this.viewId);
  }

  /**
   * Vue courante publiée dans le DataProvider `artifactView` ({view}) : les onglets du viewer (et ceux qu'un document
   * dessine lui-même) sont des `sonic-menu-item radio name="view"` dont l'état actif se déduit de cette valeur.
   */
  private publishView(id: string) {
    try {
      const view = (dp(this.n(VIEW_DP)) as unknown as {view: {get: () => unknown; set: (v: unknown) => void}}).view;
      if (view.get() !== id) view.set(id);
    } catch {
      /* ignore */
    }
  }

  /** Un clic sur un onglet (radio) écrit `artifactView.view` : on change de vue. */
  private watchView() {
    this.viewUnsub?.();
    this.viewUnsub = null;
    try {
      const view = (dp(this.n(VIEW_DP)) as unknown as {
        view: {onAssign?: (cb: (v: unknown) => void) => void; offAssign?: (cb: (v: unknown) => void) => void};
      }).view;
      const cb = (v: unknown) => {
        const views = (this.data?.document as {views?: ViewDef[]} | undefined)?.views ?? [];
        if (typeof v === "string" && v && v !== this.viewId && views.some((x) => x.id === v)) this.goView(v);
      };
      view.onAssign?.(cb);
      this.viewUnsub = () => view.offAssign?.(cb);
    } catch {
      /* ignore */
    }
  }

  private async load() {
    if (!this.slug?.trim() && !this.previewDocument) {
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
      const fetched = this.previewDocument
        ? previewArtifact(this.slug, this.previewDocument)
        : await fetchPublicArtifact(this.slug, this.linkToken());
      const roomContext = {
        slug: this.slug,
        api: loadApiBaseUrl(),
        linkToken: this.linkToken(),
        preview: !!this.previewDocument,
      };
      this.data = {
        ...fetched,
        document: transformDocument(withRoomContext(withAgentLibraries(fetched.document), roomContext)),
      };
      this.bindingCache.clear();
      this.releaseNamespace();
      this.nsNames = declaredNames(this.data.document, this.slug);
      this.nsClaim = claimNamespace(this.slug, this.nsNames);
      this.ns = this.nsClaim.ns;
      this.guardErrors = guardDocument(this.data.document);
      applyDocFonts(this.guardErrors.length ? null : (this.data.document as {fonts?: unknown}).fonts);
      applyDocFontFiles(this.guardErrors.length ? null : (this.data.document as {fontFiles?: unknown}).fontFiles);
      this.syncViewFromHash();
      this.watchView();
      if (this.viewId) this.publishView(this.viewId);
      const doc = this.data.document as {
        data?: {stores?: Record<string, StoreDef>};
      };
      this.docStores = doc.data?.stores ?? {};
      if (!this.guardErrors.length) {
        await Promise.all([loadScriptAssets(this.data.scriptAssets), ensureAddonsFor(this.data.document)]);
        this.scriptsReady = true;
        await this.applyDataProviders();
        const sinks = (this.data.document as {data?: {sinks?: Record<string, SinkDef>}}).data?.sinks;
        if (!this.previewDocument) this.stopSinks = startSinks(this.slug, this.linkToken(), this.nsSinks(sinks));
        if (!this.previewDocument) this.startIo();
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
    if (match) {
      this.setView(match.id);
      return;
    }
    // Hash qui n'est pas une vue (`/slug#tarifs`, lien partagé vers une section) : on garde la vue
    // courante (ou celle par défaut) et on défile jusqu'à l'élément une fois rendu.
    if (!this.viewId || !doc.views.some((v) => v.id === this.viewId)) {
      this.viewId = doc.defaultView ?? doc.views[0].id;
    }
    if (hash && !this.embedded) {
      void this.updateComplete.then(() => setTimeout(() => this.scrollToAnchor(hash), 50));
    }
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
        sources?: Record<string, {collection?: string; asset?: string; key?: string; refresh?: number; sort?: string; limit?: number}>;
        transforms?: Record<string, {jsonata: string}>;
      };
    };
    const sources = doc.data?.sources ?? {};
    this.sourceData = {};
    const k = this.linkToken();
    const rk = this.readKey();

    for (const [name, src] of Object.entries(sources)) {
      if (typeof src.asset === "string") {
        await this.loadAssetSource(name, src.asset, src.key);
        continue;
      }
      const collection = src.collection;
      if (typeof collection !== "string") continue;
      let member: unknown[] = [];
      let denied = false;
      try {
        member = this.previewDocument ? [] : await fetchPublicCollection(this.slug, collection, k, rk, {sort: src.sort, limit: src.limit});
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
      if (!this.previewDocument && !denied && Number.isFinite(every) && every >= 5) {
        const timer = window.setInterval(async () => {
          if (await this.refreshSource(name, collection, {sort: src.sort, limit: src.limit})) return;
          clearInterval(timer);
        }, Math.min(every, 3600) * 1000);
        this.refreshTimers.push(timer);
      }
    }

    await this.publishTransforms();
  }

  /**
   * Source « asset » : `{asset: "<URL résolue par le serveur>", key?: "chemin.pointé"}`. Le JSON (ou sa
   * partie `key`) est publié comme une collection si c'est un tableau (`{member: [...]}`), tel quel si
   * c'est un objet. Lu une fois : l'URL change quand l'asset change (empreinte). Référence non résolue
   * (asset absent, `@asset:…`), erreur réseau ou prévisualisation : source vide.
   */
  private async loadAssetSource(name: string, url: string, key?: string) {
    let value: unknown = null;
    if (!this.previewDocument && /^https?:\/\//.test(url)) {
      try {
        value = await fetchAssetJson(url);
      } catch {
        value = null;
      }
    }
    const picked = pickPath(value, key);
    const published: unknown = Array.isArray(picked)
      ? {member: picked}
      : picked && typeof picked === "object"
        ? picked
        : {member: []};
    this.sourceData[name] = Array.isArray(picked) ? picked : picked && typeof picked === "object" ? picked : [];
    set(this.n(name), published);
    set(this.n(`artifact:${this.slug}:${name}`), published);
  }

  /** Relecture périodique (`sources.<x>.refresh`, en secondes) — onglet visible seulement. */
  private async refreshSource(name: string, collection: string, query?: {sort?: string; limit?: number}): Promise<boolean> {
    if (document.hidden) return true;
    try {
      const member = await fetchPublicCollection(this.slug, collection, this.linkToken(), this.readKey(), query);
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
      this.setView(id);
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
    this.setView(id);
  }

  /**
   * Le contenu d'une vue (`sonic-sdui`) se construit après le rendu du viewer : la nouvelle image d'une transition ne doit
   * être prise qu'une fois le DOM calmé (40 ms sans mutation, 600 ms au plus), sinon la nouvelle vue serait capturée vide.
   */
  private settleRender(): Promise<void> {
    return new Promise((resolve) => {
      let quiet: ReturnType<typeof setTimeout>;
      const done = () => {
        clearTimeout(quiet);
        clearTimeout(cap);
        mo.disconnect();
        resolve();
      };
      const mo = new MutationObserver(() => {
        clearTimeout(quiet);
        quiet = setTimeout(done, 40);
      });
      mo.observe(this.renderRoot, {childList: true, subtree: true, attributes: true});
      quiet = setTimeout(done, 40);
      const cap = setTimeout(done, 600);
    });
  }

  /**
   * Change de vue ; avec `viewTransition` ("fade", "slide" ou "zoom") dans le document, la bascule passe par l'API
   * View Transitions (transition de la page entière). Sans API, avec « moins d'animations » ou à l'ouverture :
   * changement immédiat. Les éléments partagés (`view-transition-name`) ne sont pas pris en charge : le contenu des
   * vues vit dans un shadow DOM, que Chrome ignore pour les groupes nommés.
   */
  private setView(id: string) {
    if (id === this.viewId) return;
    const doc = this.data?.document as {viewTransition?: unknown; views?: ViewDef[]} | undefined;
    const kind = doc?.viewTransition;
    const start = (document as Document & {startViewTransition?: (cb: () => Promise<void>) => {ready: Promise<void>; finished: Promise<void>}}).startViewTransition;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!this.viewId || typeof start !== "function" || reduce || (kind !== "fade" && kind !== "slide" && kind !== "zoom")) {
      this.viewId = id;
      return;
    }
    const views = doc?.views ?? [];
    const forward = views.findIndex((v) => v.id === id) >= views.findIndex((v) => v.id === this.viewId);
    const root = document.documentElement;
    root.dataset.viewTransition = kind;
    root.dataset.viewDirection = forward ? "forward" : "back";
    const t = start.call(document, async () => {
      this.viewId = id;
      await this.updateComplete;
      await this.settleRender();
    });
    t.ready.catch(() => {});
    t.finished
      .catch(() => {})
      .finally(() => {
        delete root.dataset.viewTransition;
        delete root.dataset.viewDirection;
      });
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
    const mlOrigins = docMlOrigins(this.data?.document);
    if (!caps.length && !mlOrigins.length) return nothing;
    const label: Record<string, string> = {
      camera: "la caméra",
      microphone: "le micro",
      midi: "vos appareils MIDI",
      screen: "un partage d’écran",
    };
    const names = caps.map((c) => label[c] ?? c);
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}` : names[0];
    const models = mlOrigins.length
      ? html` Elle peut aussi télécharger des modèles d’analyse depuis ${mlOrigins.map((o) => new URL(o).host).join(", ")} : ils s’exécutent sur votre appareil, aucune image n’est envoyée.`
      : nothing;
    if (!caps.length) {
      return html`<p
        class="artifact-capabilities m-0 mx-3 mt-3 sm:mx-4 px-3 py-2 rounded-md text-sm print:hidden"
        style="background:rgba(127,127,127,.12)"
        role="note"
      >
        Cet artefact peut télécharger des modèles d’analyse depuis ${mlOrigins.map((o) => new URL(o).host).join(", ")} : ils s’exécutent sur votre appareil, aucune image n’est envoyée.
      </p>`;
    }
    return html`<p
      class="artifact-capabilities m-0 mx-3 mt-3 sm:mx-4 px-3 py-2 rounded-md text-sm print:hidden"
      style="background:rgba(127,127,127,.12)"
      role="note"
    >
      Cet artefact peut demander l’accès à ${list}. Rien n’est activé sans votre clic, et vous pourrez refuser.${models}
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

  /** `a2uiBindings` résolus vers le DataProvider (préfixé) de chaque store. Mis en cache par vue. */
  private bindingCache = new Map<string, Record<string, string>>();
  private a2uiBindings(view: ViewDef): Record<string, string> {
    const cached = this.bindingCache.get(view.id);
    if (cached) return cached;
    const out: Record<string, string> = {};
    for (const [pointer, storeId] of Object.entries(view.a2uiBindings ?? {})) {
      const def = this.docStores[storeId];
      if (def) out[pointer] = this.n(def.dataProvider || storeId);
    }
    this.bindingCache.set(view.id, out);
    return out;
  }

  private renderBody(root: Record<string, unknown> | null) {
    if (!this.scriptsReady) return html`<p class="opacity-70">Préparation…</p>`;
    const view = this.currentView();
    if (view && Array.isArray(view.a2ui)) {
      return html`<artifact-a2ui-view
        .messages=${view.a2ui}
        .store=${view.actionStore ? this.n(view.actionStore) : ""}
        .bindings=${this.a2uiBindings(view)}
        .prefix=${this.n(`a2ui_${this.slug}_`).replace(/[^\w-]/g, "_")}
      ></artifact-a2ui-view>`;
    }
    return root ? html`<sonic-sdui .props=${root}></sonic-sdui>` : html`<p class="opacity-70">Préparation…</p>`;
  }

  render() {
    if (this.loading) {
      return html`<p class="p-4 m-0" role="status" style="color: color-mix(in srgb, currentColor 70%, transparent)">
        Chargement…
      </p>`;
    }
    if (this.error) {
      return html`<div class="p-4 sm:p-6 flex flex-col gap-2 max-w-xl" role="alert">
        <h1 class="text-xl font-semibold m-0">Impossible d’afficher l’artefact</h1>
        <p class="m-0" style="color: color-mix(in srgb, var(--sc-danger, #c00) 75%, var(--sc-base-content, currentColor))">
          ${this.error}
        </p>
      </div>`;
    }
    if (!this.data) return nothing;
    if (this.guardErrors.length) {
      return html`<div class="p-4 sm:p-6 flex flex-col gap-2 max-w-xl" role="alert">
        <h1 class="text-xl font-semibold m-0">Document refusé</h1>
        <ul class="m-0">
          ${this.guardErrors.map(
            (e) => html`<li><code>${e.path}</code> — ${e.message}</li>`,
          )}
        </ul>
        ${this.data.canWrite
          ? html`<p class="text-sm m-0" style="color: color-mix(in srgb, currentColor 70%, transparent)">
              Corrigez le document et republiez.
            </p>`
          : nothing}
      </div>`;
    }
    const doc = this.data.document as {views?: ViewDef[]};
    const root = this.currentRoot();
    // Vues `hidden` : hors onglets, accessibles seulement par leur #id.
    const views = (doc.views ?? []).filter((v) => v.hidden !== true);
    const frame = pageFrame(doc);
    return html`
      <div class="artifact-bare flex flex-col min-h-full" style=${frame.background ? `background:${frame.background}` : nothing}>
        ${this.data.draft
          ? html`<p class="m-0 px-3 py-1 text-sm print:hidden" role="status" style="background: color-mix(in srgb, var(--sc-warning, #d90) 25%, transparent)">
              Brouillon — non publié (visible par les membres seulement).
            </p>`
          : nothing}
        ${this.renderDocStores()}
        ${views.length > 1 && frame.nav !== "none"
          ? html`
              <nav class="artifact-nav px-3 pt-3 sm:px-4 print:hidden" aria-label="Vues">
                <sonic-menu direction="row" scrollable size="sm">
                  ${views.map(
                    (v) => html`
                      <sonic-menu-item radio formDataProvider=${this.n(VIEW_DP)} name="view" value=${v.id}
                        >${v.title}</sonic-menu-item
                      >
                    `,
                  )}
                </sonic-menu>
              </nav>
            `
          : nothing}
        ${this.renderCapabilities()} ${this.renderIoStatus()}
        <div class="artifact-sdui flex-1 min-h-[12rem] ${paddingClass(frame.padding)}">
          ${this.renderBody(root)}
        </div>
      </div>
    `;
  }
}

/** Enveloppe locale d'un document en aperçu (pas de scripts résolus, pas de collections). */
function previewArtifact(slug: string, document: Record<string, unknown>): PublicArtifact {
  return {
    id: "preview",
    slug: slug || "preview",
    title: String(document.title ?? "Aperçu"),
    document,
    scriptAssets: [],
    concordeVersion: "",
    version: 0,
    updatedAt: new Date().toISOString(),
    collections: [],
    canWrite: false,
    visibility: "private",
  };
}

/** Valeur à un chemin pointé (`a.b.0`) ; sans chemin, la valeur elle-même. */
function pickPath(value: unknown, path?: string): unknown {
  if (!path) return value;
  let cur: unknown = value;
  for (const part of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function isDenied(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 404);
}
