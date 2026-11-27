import {applyAppIdentity, clearAppIdentity} from "../app-identity";
import "@supersoniks/concorde/button";
import "@supersoniks/concorde/menu";
import "@supersoniks/concorde/menu-item";
import "@supersoniks/concorde/sdui";
import "./artifact-loader";
import "./artifact-a2ui-view";
import {agentStackLibrary, injectAgentStackStyles} from "@ladigitale/agent-stack/libraries";
import type {A2uiServerMessage} from "@ladigitale/agent-stack/a2ui";
import {css, html, LitElement, nothing} from "lit";
import {customElement, property, state} from "lit/decorators.js";
import {
  fetchPublicArtifact,
  ApiError,
  fetchAssetJson,
  fetchPublicCollection,
  type PublicArtifact,
} from "../cloud/client";
import {explainFetchError, loadApiBaseUrl} from "../cloud/api-base";
import {guardDocument} from "../sdui-guard";
import {applySafeTransforms} from "../jsonata-safe";
import {loadScriptAssets} from "../script-loader";
import {ensureAddonsFor} from "../addons";
import {startSinks, type SinkDef} from "../sinks";
import {applyLive, sortAndLimit, startCollectionLive, type LiveMessage, type LiveRow} from "../collection-live";
import {startPlaces, type PlacesDef} from "../places";
import {persistDecl, persistKey, plain, readSaved, writeSaved} from "../persist";
import {OnlineSave, onlineDecl} from "../online-save";
import {mapPath, runFromLocation, startIoRun, waitForStore, type IoDef, type IoStatus} from "../io-run";
import {claimPair, DESK_ROLE, joinStream, pairFromLocation, pairRoles, requestDesk, requestPair, RunStream, watchFromLocation, type PairInfo, type StreamJoin} from "../run-stream";
import {applyPatch, type PatchOp} from "../json-patch";
import {applyDocFontFiles, applyDocFonts} from "../doc-fonts";
import {claimNamespace, transformDocument, type NamespaceClaim} from "../doc-transform";
import {withRoomContext} from "../room-context";
import {RUN_DP, VIEW_DP, declaredNames, nsName, nsTree, nsValue} from "../dp-namespace";
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

type SourceDef = {
  collection?: string;
  /** Collections en plus, lues avec `collection` (canaux d'un sink à plusieurs canaux). */
  channels?: string[];
  asset?: string;
  key?: string;
  refresh?: number;
  sort?: string;
  limit?: number;
  intake?: {minInterval?: number; permanent?: boolean};
};

const MAX_SOURCE_CHANNELS = 8;

function sourceChannels(src: SourceDef): string[] {
  const all = [src.collection, ...(Array.isArray(src.channels) ? src.channels : [])];
  return all
    .filter((c): c is string => typeof c === "string" && c !== "")
    .filter((c, i, list) => list.indexOf(c) === i)
    .slice(0, MAX_SOURCE_CHANNELS);
}

type StoreDef = {
  initial?: unknown;
  reducer?: string;
  dataProvider?: string;
  history?: number;
  budgetMs?: number;
  bootAction?: string;
  historySkip?: string;
  /** Taille maximale de l'état (octets, JSON) : 256 Ko par défaut, 1,2 Mo au plus (images d'un monde). */
  maxStateBytes?: number;
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

  static styles = [
    tailwind,
    css`
      /* Bandeau d'une tâche : flottant, il ne décale pas un artefact plein écran (hauteur 100svh). */
      .artifact-io-status {
        position: fixed;
        top: max(8px, env(safe-area-inset-top));
        left: 50%;
        transform: translateX(-50%);
        z-index: 1000;
        width: max-content;
        max-width: min(calc(100vw - 24px), 36rem);
        box-sizing: border-box;
        background: color-mix(in oklab, var(--sc-base, #fff) 88%, transparent);
        color: var(--sc-base-content, inherit);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgb(127 127 127 / 0.25);
        box-shadow: 0 10px 30px -18px rgb(0 0 0 / 0.5);
        pointer-events: none;
      }
      /* Intégré dans une page tiers : flottant dans le cadre du viewer, pas dans la page hôte. */
      :host([embedded]) {
        position: relative;
      }
      /* Garde-fou : un document en \`position:fixed;inset:0\` (jeu plein écran) remplit le cadre
         du viewer, pas la page hôte ni l'atelier. \`contain: layout\` fait du cadre le bloc
         conteneur des descendants fixes. */
      :host([embedded]) .artifact-bare {
        contain: layout;
      }
      :host([embedded]) .artifact-io-status {
        position: absolute;
        top: 8px;
      }
      /* « Tâche en cours » s'efface après quelques secondes ; envoi, fin et erreurs restent. */
      .artifact-io-status[data-state="waiting"] {
        animation: artifact-io-fade 0.6s ease 6s forwards;
      }
      .artifact-io-status[data-state="error"],
      .artifact-io-status[data-state="closed"] {
        pointer-events: auto;
      }
      @keyframes artifact-io-fade {
        to {
          opacity: 0;
          visibility: hidden;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .artifact-io-status[data-state="waiting"] {
          animation-duration: 0s;
        }
      }
      @media print {
        .artifact-io-status {
          display: none;
        }
      }
    `,
  ];

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
  /** Embed : jeton de spectateur d'un run en flux (`io.stream`), avec `run`. */
  @property({type: String, attribute: "watch-token"}) watchToken = "";

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
  /** Sources de collection lues (canaux compris), pour la relecture qui suit un envoi. */
  private liveSources = new Map<string, {collection: string; channels: string[]; sort?: string; limit?: number}>();
  private refreshSoonTimer = 0;
  /** Records de chaque source de collection (avec leur id), pour appliquer les changements en direct. */
  private sourceRows = new Map<string, LiveRow[]>();
  private sourceReadAt = new Map<string, number>();
  /** Abonnements en direct par collection ; `liveGen` invalide ceux qui arrivent après un démontage. */
  private liveStops = new Map<string, () => void>();
  private liveStarting = new Set<string>();
  private liveGen = 0;
  private refreshSoonPending = new Set<string>();
  private stopSinks: (() => void) | null = null;
  private stopPlaces: (() => void) | null = null;
  private stopIo: (() => void) | null = null;
  /** Flux du run (io.stream) et document reçu avant transformation (cible des document.patch). */
  private runStream: RunStream | null = null;
  private streamJoin: StreamJoin | null = null;
  private rawDocument: Record<string, unknown> | null = null;
  private streamDoc = Promise.resolve();
  /** Appairage : code de l'hôte (renouvelé) et erreur de réclamation d'un code ouvert ici. */
  private pairTimer = 0;
  private pairInfo: PairInfo | null = null;
  private pairsInfo: Record<string, PairInfo> = {};
  private deskInfo: PairInfo | null = null;
  private deskHost: {slug: string; runId: string} | null = null;
  private pairRefresh: (() => Promise<void>) | null = null;
  private runInfo: Record<string, unknown> | null = null;
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
    this.stopOnline();
    this.viewUnsub?.();
    this.viewUnsub = null;
    this.clearLiveData();
    this.releaseNamespace();
    applyDocFonts(null);
    applyDocFontFiles(null);
    if (!this.previewDocument && !this.embedded) clearAppIdentity();
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
    if (this.refreshSoonTimer) clearTimeout(this.refreshSoonTimer);
    this.refreshSoonTimer = 0;
    this.refreshSoonPending.clear();
    this.liveSources.clear();
    this.liveStops.forEach((stop) => stop());
    this.liveStops.clear();
    this.liveStarting.clear();
    this.liveGen++;
    this.sourceRows.clear();
    this.sourceReadAt.clear();
    this.stopSinks?.();
    this.stopSinks = null;
    this.stopPlaces?.();
    this.stopPlaces = null;
    this.stopIo?.();
    this.stopIo = null;
    this.runStream?.stop();
    this.runStream = null;
    clearInterval(this.pairTimer);
    this.pairTimer = 0;
    this.pairInfo = null;
    this.pairsInfo = {};
    this.deskInfo = null;
    this.deskHost = null;
    this.pairRefresh = null;
    this.runInfo = null;
    this.ioStatus = null;
  }

  /**
   * Store qui reçoit un flux (`io.stream`) : une action qui dépasse le budget du store est ignorée,
   * et un écran qui saute un message n'est plus synchrone avec les autres. Budget plus large par défaut.
   */
  private isStreamStore(id: string): boolean {
    const io = (this.data?.document as {io?: IoDef} | undefined)?.io;
    return !!io?.stream && ((io.stream.store ?? io.input?.store) === id || io.stream.emit?.ack === id);
  }

  /** Run en flux : viewer du run (`rt`) ou spectateur (`wt`), d'après la page ou les attributs d'embed. */
  private streamTarget(doc: unknown): {id: string; token: string; role: "performer" | "watcher"} | null {
    if (this.previewDocument) return null;
    const io = (doc as {io?: IoDef} | null)?.io;
    if (!io?.stream) return null;
    if (this.embedded) {
      if (!this.run) return null;
      if (this.watchToken) return {id: this.run, token: this.watchToken, role: "watcher"};
      return this.runToken ? {id: this.run, token: this.runToken, role: "performer"} : null;
    }
    const watch = watchFromLocation(location.search);
    if (watch) return {...watch, role: "watcher"};
    const run = runFromLocation(location.search);
    return run ? {...run, role: "performer"} : null;
  }

  /** Démarre le flux une fois le store prêt (et, pour le viewer du run, l'entrée envoyée). */
  private async startStream(join: StreamJoin, target: {id: string; token: string; role: "performer" | "watcher"}, ctl: {finish?: () => void}) {
    const io = (this.data?.document as {io?: IoDef} | undefined)?.io;
    const storeName = io?.stream?.store ?? io?.input?.store;
    const emitDef = io?.stream?.emit;
    // Un run qui ne fait qu'émettre (télécommande) n'a pas forcément de store de flux.
    if (!io || (!storeName && !emitDef?.from)) return;
    const storeId = storeName ? this.n(storeName) : "";
    const waitFor = storeId || (emitDef?.ack ? this.n(emitDef.ack) : "");
    if (waitFor && !(await waitForStore(waitFor, () => !this.isConnected || this.streamJoin !== join))) return;
    if (this.streamJoin !== join) return;
    const def = storeName ? this.docStores[storeName] : undefined;
    const emit = target.role === "performer" && emitDef?.from
      ? {path: mapPath(emitDef.from, (n) => this.n(n)), ack: emitDef.ack ? this.n(emitDef.ack) : null}
      : null;
    const progress = target.role === "performer" && io.stream?.progress?.from
      ? {path: mapPath(io.stream.progress.from, (n) => this.n(n)), every: Math.max(100, io.stream.progress.every ?? 1000)}
      : null;
    this.runStream?.stop();
    this.publishRun(join, target.role, join.status);
    const sx = io.stream as {pair?: unknown; desk?: unknown; inscription?: unknown} | undefined;
    if (target.role === "performer" && join.status === "pending" && sx?.pair) {
      // Guichet d'inscription déclaré : un code de plus (rôle réservé), publié dans artifactRun.desk.
      this.startPairing(target.id, target.token, [...pairRoles(sx.pair), ...(sx.desk ? [DESK_ROLE] : [])]);
    } else if (target.role === "performer" && join.status === "pending" && sx?.inscription === true) {
      this.startDesk(target.id, target.token);
    }
    const stream = new RunStream({
      slug: this.slug,
      runId: target.id,
      token: target.token,
      role: target.role,
      join,
      storeId,
      stateDp: storeName ? this.n(def?.dataProvider || storeName) : "",
      input: target.role === "watcher" && io.input?.store ? {action: io.input.action || "io:input", payload: join.input ?? {}} : null,
      progress,
      emit,
      applyDocumentPatch: (patch) => this.patchDocument(patch),
      onPresence: (p) => {
        if (!this.runInfo) return;
        this.runInfo = {...this.runInfo, presence: p};
        this.setRunDp();
        // Un appareil arrivé ou parti change les places restantes.
        void this.pairRefresh?.();
      },
      onPairOps: () => void this.pairRefresh?.(),
      onEnd: () => {
        if (target.role === "performer") ctl.finish?.();
        else this.ioStatus = {state: "closed", message: "Le direct est terminé."};
      },
      onStatus: (s) => {
        this.dataset.stream = s.closed ? "closed" : s.ended ? "ended" : s.transport;
        if (s.closed) this.publishRun(join, target.role, s.closed);
        if (target.role === "watcher" && s.closed) this.ioStatus = {state: "closed", message: "Le direct est terminé."};
      },
    });
    this.runStream = stream;
    await stream.start();
  }

  /** DataProvider `artifactRun` : ce que le document peut montrer du run (jamais le jeton du run). */
  private publishRun(join: StreamJoin, role: "performer" | "watcher", status: string) {
    this.runInfo = {runId: join.runId, role, watchUrl: join.watchUrl ?? null, status, presence: this.runInfo?.presence ?? join.presence ?? {count: 0, members: []}};
    this.setRunDp();
  }

  private setRunDp() {
    if (!this.runInfo) return;
    set(this.n(RUN_DP), {...this.runInfo, pair: this.pairInfo, pairs: this.pairsInfo, desk: this.deskInfo, host: this.deskHost} as never);
  }

  /**
   * Hôte d'un appairage (io.stream.pair, viewer du run) : demande le code et le renouvelle (le
   * serveur rend le même tant qu'il reste valide) ; `artifactRun.pair` suit aussi les places prises.
   */
  private startPairing(runId: string, runToken: string, roles: (string | null)[]) {
    clearInterval(this.pairTimer);
    let busy = false;
    const refresh = async () => {
      if (busy || !roles.length) return;
      busy = true;
      try {
        const infos = await Promise.all(roles.map(async (role) => {
          try {
            return await requestPair(this.slug, runId, runToken, role);
          } catch (e) {
            return {role, code: null, url: null, expiresAt: null, remaining: 0, max: 0, paired: 0, remote: "", error: e instanceof Error ? e.message : String(e)} as PairInfo;
          }
        }));
        const pairs: Record<string, PairInfo> = {};
        this.pairInfo = null;
        roles.forEach((role, k) => {
          if (role === DESK_ROLE) this.deskInfo = infos[k];
          else {
            this.pairInfo ??= infos[k];
            if (role) pairs[role] = infos[k];
          }
        });
        this.pairsInfo = pairs;
        this.setRunDp();
      } finally {
        busy = false;
      }
    };
    this.pairRefresh = refresh;
    void refresh();
    this.pairTimer = window.setInterval(() => void refresh(), PAIR_REFRESH_MS);
  }

  /**
   * Guichet d'inscription (io.stream.inscription) : relit les codes de sa régie avec son propre jeton
   * et les publie comme sur la régie (artifactRun.pair, artifactRun.pairs.<rôle>, artifactRun.host).
   */
  private startDesk(runId: string, runToken: string) {
    clearInterval(this.pairTimer);
    let busy = false;
    const refresh = async () => {
      if (busy) return;
      busy = true;
      try {
        const d = await requestDesk(this.slug, runId, runToken);
        this.pairInfo = d.pair ? {...d.pair, locked: d.locked} : null;
        this.pairsInfo = Object.fromEntries(Object.entries(d.pairs ?? {}).map(([r, i]) => [r, {...i, locked: d.locked}]));
        this.deskHost = d.host;
        this.setRunDp();
      } catch {
        // Régie terminée ou guichet retiré : on garde le dernier état connu.
      } finally {
        busy = false;
      }
    };
    this.pairRefresh = refresh;
    void refresh();
    this.pairTimer = window.setInterval(() => void refresh(), DESK_REFRESH_MS);
  }

  /**
   * `document.patch` d'un flux : le document reçu (avant transformation) est patché puis réappliqué
   * sans recharger : stores, vue et données gardent leur état ; sources et transforms ne sont relues
   * que si elles ont changé.
   */
  private patchDocument(patch: PatchOp[]): Promise<void> {
    this.streamDoc = this.streamDoc.then(async () => {
      if (!this.data || !this.rawDocument) return;
      const before = JSON.stringify(dataPart(this.rawDocument));
      this.rawDocument = applyPatch(this.rawDocument, patch);
      const roomContext = {slug: this.slug, api: loadApiBaseUrl(), linkToken: this.linkToken(), preview: false};
      const document = transformDocument(withRoomContext(withAgentLibraries(this.rawDocument), roomContext));
      const errors = guardDocument(document);
      if (errors.length) throw new Error(`${errors[0].path} : ${errors[0].message}`);
      this.data = {...this.data, document};
      this.bindingCache.clear();
      this.rootCache.clear();
      applyDocFonts((document as {fonts?: unknown}).fonts);
      applyDocFontFiles((document as {fontFiles?: unknown}).fontFiles);
      this.docStores = (document as {data?: {stores?: Record<string, StoreDef>}}).data?.stores ?? {};
      await ensureAddonsFor(document);
      const views = (document as {views?: ViewDef[]}).views ?? [];
      if (!views.some((v) => v.id === this.viewId)) this.syncViewFromHash();
      if (JSON.stringify(dataPart(this.rawDocument)) !== before) {
        this.clearTransformWatchers();
        await this.applyDataProviders();
      }
    });
    return this.streamDoc;
  }

  /**
   * Contrat `io` : entrée d'un run (`?run=&rt=` sur la page, `run` / `run-token` ou `input` en
   * embed) envoyée au store, sortie émise (`artifact-output`) et publiée quand `when` est vraie.
   */
  private startIo(stream: {join: StreamJoin; target: {id: string; token: string; role: "performer" | "watcher"}} | null = null) {
    const io = (this.data?.document as {io?: IoDef} | undefined)?.io;
    if (!io?.output?.from) return;
    // Aperçu de l'atelier : jamais de run serveur, seulement l'entrée d'essai (`input`).
    const run = this.previewDocument
      ? null
      : this.embedded
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
    // Page complète sans run : rien. Intégré (embed, atelier) : la sortie est émise même sans entrée.
    if (!run && input === undefined && !this.embedded) return;
    const ctl: {finish?: () => void} = {};
    this.stopIo = startIoRun({
      slug: this.slug,
      io,
      run,
      input,
      controller: ctl,
      // Reprise d'un run en flux : l'instantané d'état contient déjà l'entrée.
      skipInput: () => !!stream?.join.snapshot,
      onReady: () => {
        if (stream && stream.join.status === "pending") void this.startStream(stream.join, stream.target, ctl);
      },
      resolve: (name) => this.n(name),
      onStatus: (s) => {
        // En embed local, pas de bandeau : la page hôte reçoit l'événement.
        this.ioStatus = run || s.state === "error" ? s : null;
      },
      onOutput: (output, runId, files) => {
        this.dispatchEvent(
          new CustomEvent("artifact-output", {detail: {output, files, runId, slug: this.slug}, bubbles: true, composed: true}),
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
      class="artifact-io-status m-0 px-3 py-2 rounded-md text-sm"
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
    // Aperçu : une nouvelle entrée d'essai rejoue l'artefact depuis son état initial.
    else if (this.previewDocument && changed.has("input") && changed.get("input") !== undefined) void this.load();
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
    let pairError = "";
    try {
      // Lien d'appairage ouvert ici (?pair=<code>) : réclamer la place, puis continuer comme le
      // viewer du run reçu (l'adresse prend ?run=&rt= : un rechargement garde la même place).
      const pairCode = !this.embedded && !this.previewDocument ? pairFromLocation(location.search) : null;
      if (pairCode) {
        try {
          const claimed = await claimPair(this.slug, pairCode);
          const url = new URL(location.href);
          url.searchParams.delete("pair");
          url.searchParams.set("run", claimed.runId);
          url.searchParams.set("rt", claimed.runToken);
          history.replaceState(history.state, "", url.toString());
        } catch (e) {
          pairError = e instanceof Error ? e.message : String(e);
        }
      }
      let fetched = this.previewDocument
        ? previewArtifact(this.slug, this.previewDocument)
        : await fetchPublicArtifact(this.slug, this.linkToken());
      // Run en flux : le document courant (déjà patché par le flux) remplace celui de la version.
      const target = this.streamTarget(fetched.document);
      let join: StreamJoin | null = null;
      if (target) {
        try {
          join = await joinStream(this.slug, target.id, target.token, target.role);
          if (join.document) fetched = {...fetched, document: join.document};
        } catch (e) {
          if (target.role === "watcher") throw e;
          join = null;
        }
      }
      this.streamJoin = join;
      this.rawDocument = fetched.document as Record<string, unknown>;
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
      // Page d'artefact (ni aperçu ni intégration) : titre, icônes et manifeste propres, installable.
      if (!this.previewDocument && !this.embedded) applyAppIdentity(this.slug, String(fetched.title ?? ""), this.rawDocument, this.linkToken(), {description: fetched.description, version: fetched.version});
      this.syncViewFromHash();
      this.watchView();
      if (this.viewId) this.publishView(this.viewId);
      const doc = this.data.document as {
        data?: {stores?: Record<string, StoreDef>};
      };
      // sauvegarde en ligne : la plus récente remplace la locale avant que les stores démarrent
      this.stopOnline();
      if (!this.guardErrors.length && !this.previewDocument && !this.embedded) await this.startOnline();
      this.docStores = doc.data?.stores ?? {};
      if (!this.guardErrors.length) {
        await Promise.all([loadScriptAssets(this.data.scriptAssets), ensureAddonsFor(this.data.document)]);
        this.scriptsReady = true;
        await this.applyDataProviders();
        this.watchOnline();
        const sinks = (this.data.document as {data?: {sinks?: Record<string, SinkDef>}}).data?.sinks;
        if (!this.previewDocument) {
          this.stopSinks = startSinks(this.slug, this.linkToken(), this.nsSinks(sinks), {
            minInterval: this.intakeIntervals(),
            onSent: (collection) => this.refreshSoon(collection),
          });
        }
        const places = (this.data.document as {data?: {places?: Record<string, PlacesDef>}}).data?.places;
        if (!this.previewDocument && places) this.stopPlaces = startPlaces(this.slug, this.linkToken(), this.nsPlaces(places), (n) => this.nsPlaceName(n));
        if (target?.role === "watcher" && join) {
          if (join.status !== "pending") this.ioStatus = {state: "closed", message: "Le direct est terminé."};
          void this.startStream(join, target, {});
        } else {
          this.startIo(join && target ? {join, target} : null);
        }
        if (pairError) this.ioStatus = {state: "error", message: `Appairage impossible : ${pairError}`};
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
    for (const [name, computed] of Object.entries(transforms)) {
      // data.persist : au premier calcul, la sauvegarde l'emporte (puis elle suit les changements)
      const key = this.persistKeyOf(name);
      const saved = key && !this.persistWatched.has(name) ? readSaved(key) : undefined;
      const same = saved !== undefined && typeof saved === typeof computed && Array.isArray(saved) === Array.isArray(computed);
      // objet : les clés ajoutées au document depuis la sauvegarde gardent leur valeur calculée
      const isObj = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v);
      const value = same && isObj(saved) && isObj(computed) ? {...(computed as object), ...(saved as object)} : same ? saved : computed;
      set(this.n(name), value);
      set(this.n(`artifact:${this.slug}:transform:${name}`), value);
      if (key && !this.persistWatched.has(name)) this.watchPersisted(name, key);
    }
  }

  /* ---------------------------------------------------------------- sauvegarde en ligne (data.persist.online) */

  private online: OnlineSave | null = null;
  private onlineUnsubs: Array<() => void> = [];
  private onlineStatus = "";
  private readonly onPageHide = () => this.online?.flush();

  private async startOnline() {
    const doc = this.data?.document;
    const on = onlineDecl(doc);
    const decl = persistDecl(doc);
    if (!on || !decl || !this.data) return;
    const id = (this.data as {id?: string}).id || this.slug;
    this.onlineStatus = on.status;
    this.online = new OnlineSave(
      this.slug,
      this.ns ? `${id}:${this.ns}` : id,
      this.linkToken(),
      () => {
        const out: Record<string, unknown> = {};
        for (const p of decl.providers) {
          try {
            const v = plain((dp(this.n(p)) as {get?: () => unknown}).get?.());
            if (v !== undefined) out[p] = v;
          } catch {
            /* DataProvider indisponible */
          }
        }
        return out;
      },
      (st) => {
        if (this.onlineStatus) set(this.n(this.onlineStatus), {...st});
      },
    );
    const pulled = await this.online.pull();
    if (pulled) for (const p of decl.providers) if (pulled[p] !== undefined) writeSaved(this.persistKeyOf(p), pulled[p]);
    if (this.onlineStatus) set(this.n(this.onlineStatus), {...this.online.status});
    window.addEventListener("pagehide", this.onPageHide);
  }

  /** Chaque changement d'un DataProvider sauvegardé part en ligne (2 s après le dernier). */
  private watchOnline() {
    const save = this.online;
    const decl = persistDecl(this.data?.document);
    if (!save || !decl) return;
    for (const p of decl.providers) {
      try {
        const provider = dp(this.n(p)) as {onInternalMutation?: (cb: () => void) => void; offInternalMutation?: (cb: () => void) => void};
        let first = true;
        const cb = () => {
          if (first) {
            first = false;
            return;
          }
          save.changed();
        };
        provider.onInternalMutation?.(cb);
        this.onlineUnsubs.push(() => provider.offInternalMutation?.(cb));
      } catch {
        /* DataProvider indisponible */
      }
    }
  }

  private stopOnline() {
    for (const off of this.onlineUnsubs) off();
    this.onlineUnsubs = [];
    this.online?.dispose();
    this.online = null;
    window.removeEventListener("pagehide", this.onPageHide);
  }

  /** Transforms listées dans data.persist déjà écoutées (une fois par chargement). */
  private persistWatched = new Set<string>();

  /**
   * Clé de sauvegarde locale d'un DataProvider listé dans `data.persist` (vide : pas de sauvegarde ; jamais dans
   * l'aperçu de l'atelier, où le document change à chaque essai).
   */
  private persistKeyOf(name: string): string {
    if (!this.data || this.previewDocument) return "";
    const decl = persistDecl(this.data.document);
    if (!decl || !decl.providers.includes(name)) return "";
    const id = (this.data as {id?: string}).id || this.slug;
    return persistKey(this.ns ? `${id}:${this.ns}` : id, decl, name);
  }

  /** Enregistre une transform à chaque changement (formulaires qui écrivent dedans compris), 400 ms après. */
  private watchPersisted(name: string, key: string) {
    this.persistWatched.add(name);
    try {
      const provider = dp(this.n(name)) as {
        get?: () => unknown;
        onInternalMutation?: (cb: () => void) => void;
        offInternalMutation?: (cb: () => void) => void;
      };
      let timer = 0;
      let first = true;
      const cb = () => {
        // appel immédiat à l'abonnement : rien de neuf à enregistrer
        if (first) {
          first = false;
          return;
        }
        clearTimeout(timer);
        timer = window.setTimeout(() => writeSaved(key, plain(provider.get?.())), 400);
      };
      provider.onInternalMutation?.(cb);
      this.transformUnsubs.push(() => {
        clearTimeout(timer);
        provider.offInternalMutation?.(cb);
        this.persistWatched.delete(name);
      });
    } catch {
      /* DataProvider indisponible : pas de sauvegarde */
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
        sources?: Record<string, SourceDef>;
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
      const channels = sourceChannels(src);
      let member: unknown[] = [];
      let denied = false;
      try {
        member = this.previewDocument ? [] : await this.fetchChannels(channels, k, rk, {sort: src.sort, limit: src.limit});
      } catch (e) {
        member = [];
        denied = isDenied(e);
      }
      this.sourceRows.set(name, member as LiveRow[]);
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
        this.liveSources.set(name, {collection, channels, sort: src.sort, limit: src.limit});
        const timer = window.setInterval(async () => {
          // En direct : relecture de secours seulement (le hub apporte chaque changement).
          if (this.isLive(channels) && Date.now() - (this.sourceReadAt.get(name) ?? 0) < LIVE_FALLBACK_MS) return;
          if (await this.refreshSource(name, collection, {sort: src.sort, limit: src.limit}, channels)) return;
          clearInterval(timer);
        }, Math.min(every, 3600) * 1000);
        this.refreshTimers.push(timer);
        this.sourceReadAt.set(name, Date.now());
        for (const c of channels) void this.startLive(c);
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

  /**
   * Lit une collection et ses canaux (`sources.<x>.channels`, écrits par un sink à plusieurs
   * canaux) en parallèle, puis les met bout à bout (chaque canal trié / limité par le serveur).
   */
  private async fetchChannels(
    channels: string[],
    k: string | null,
    rk: string | null,
    query?: {sort?: string; limit?: number},
  ): Promise<unknown[]> {
    if (channels.length === 1) return fetchPublicCollection(this.slug, channels[0], k, rk, query);
    const parts = await Promise.all(channels.map((c) => fetchPublicCollection(this.slug, c, k, rk, query)));
    return parts.flat();
  }

  /** `intake.minInterval` de chaque collection déclarée dans `data.sources` (cadence des sinks). */
  private intakeIntervals(): Record<string, number> {
    const sources = (this.data?.document as {data?: {sources?: Record<string, SourceDef>}} | undefined)?.data?.sources ?? {};
    const out: Record<string, number> = {};
    for (const src of Object.values(sources)) {
      if (typeof src?.collection !== "string" || !src.intake) continue;
      // Défauts de l'API (ArtifactIntakeSchema) : 3 s pour une collecte permanente, 0 sinon.
      const min = Number(src.intake.minInterval ?? (src.intake.permanent ? PERMANENT_MIN_INTERVAL_S : 0));
      if (Number.isFinite(min) && min > 0) out[src.collection] = min;
    }
    return out;
  }

  /**
   * Après un envoi réussi : relit, peu après, les sources relues périodiquement qui lisent cette
   * collection, sans attendre leur prochain `refresh` (l'envoi est visible tout de suite).
   */
  private refreshSoon(collection: string) {
    // En direct, le hub apporte déjà l'envoi.
    if (this.liveStops.has(collection)) return;
    if (this.refreshSoonTimer) clearTimeout(this.refreshSoonTimer);
    this.refreshSoonPending.add(collection);
    this.refreshSoonTimer = window.setTimeout(() => {
      this.refreshSoonTimer = 0;
      const touched = new Set(this.refreshSoonPending);
      this.refreshSoonPending.clear();
      for (const [name, src] of this.liveSources) {
        if (src.channels.some((c) => touched.has(c))) {
          void this.refreshSource(name, src.collection, {sort: src.sort, limit: src.limit}, src.channels);
        }
      }
    }, REFRESH_SOON_MS);
  }

  private publishRows(name: string, collection: string, rows: LiveRow[]) {
    this.sourceRows.set(name, rows);
    const items = rows.map((row) =>
      row && typeof row === "object" && "data" in row ? (row as {data: unknown}).data : row,
    );
    set(this.n(name), {member: items});
    set(this.n(collection), {member: items});
    set(this.n(`artifact:${this.slug}:${name}`), {member: items});
  }

  private isLive(channels: string[]): boolean {
    return channels.every((c) => this.liveStops.has(c));
  }

  /**
   * Abonnement en direct à une collection (une fois par collection, partagé par les sources qui
   * la lisent). Sans hub ou sur une API plus ancienne : rien, la relecture périodique continue.
   */
  private async startLive(collection: string) {
    if (this.liveStops.has(collection) || this.liveStarting.has(collection) || this.previewDocument) return;
    this.liveStarting.add(collection);
    const gen = this.liveGen;
    const stop = await startCollectionLive(this.slug, collection, this.linkToken(), this.readKey(), {
      onMessage: (msg) => this.applyLiveMessage(collection, msg),
      onResync: () => this.resyncCollection(collection),
    });
    this.liveStarting.delete(collection);
    if (!stop) return;
    if (gen !== this.liveGen) {
      stop();
      return;
    }
    this.liveStops.set(collection, stop);
  }

  private applyLiveMessage(collection: string, msg: LiveMessage) {
    for (const [name, src] of this.liveSources) {
      if (!src.channels.includes(collection)) continue;
      // Retrait dans une source bornée (`limit`) : le suivant n'est pas connu ici, relecture.
      if (src.limit && msg.remove?.length) {
        void this.refreshSource(name, src.collection, {sort: src.sort, limit: src.limit}, src.channels);
        continue;
      }
      const rows = sortAndLimit(applyLive(this.sourceRows.get(name) ?? [], msg), src.sort, src.limit);
      this.publishRows(name, src.collection, rows);
    }
  }

  private resyncCollection(collection: string) {
    for (const [name, src] of this.liveSources) {
      if (src.channels.includes(collection)) {
        void this.refreshSource(name, src.collection, {sort: src.sort, limit: src.limit}, src.channels);
      }
    }
  }

  /** Relecture périodique (`sources.<x>.refresh`, en secondes) — onglet visible seulement. */
  private async refreshSource(
    name: string,
    collection: string,
    query?: {sort?: string; limit?: number},
    channels: string[] = [collection],
  ): Promise<boolean> {
    if (document.hidden) return true;
    try {
      const member = await this.fetchChannels(channels, this.linkToken(), this.readKey(), query);
      this.sourceReadAt.set(name, Date.now());
      this.publishRows(name, collection, member as LiveRow[]);
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

  private nsPlaceName(name: string): string {
    return this.ns ? nsValue(this.ns, this.nsNames, name) : name;
  }

  private nsPlaces(places: Record<string, PlacesDef>): Record<string, PlacesDef> {
    if (!this.ns) return places;
    const v = (x: string | undefined) => (typeof x === "string" ? nsValue(this.ns, this.nsNames, x) : x);
    const out: Record<string, PlacesDef> = {};
    for (const [name, p] of Object.entries(places)) {
      if (p) out[name] = {...p, near: v(p.near), from: v(p.from), ack: v(p.ack), area: v(p.area), thread: v(p.thread), routes: v(p.routes), route: v(p.route)};
    }
    return out;
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
            budget-ms=${def.budgetMs ?? (this.isStreamStore(id) ? STREAM_STORE_BUDGET_MS : 8)}
            boot-action=${def.bootAction ?? ""}
            persist=${this.persistKeyOf(id)}
            history-skip=${def.historySkip ?? ""}
            max-state-bytes=${Number.isInteger(def.maxStateBytes) && (def.maxStateBytes as number) > 0 ? Math.min(def.maxStateBytes as number, 1200 * 1024) : 256 * 1024}
          ></sonic-store>`;
        })}
      </div>
    `;
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
    if (!this.scriptsReady) return html`<artifact-loader></artifact-loader>`;
    const view = this.currentView();
    if (view && Array.isArray(view.a2ui)) {
      return html`<artifact-a2ui-view
        .messages=${view.a2ui}
        .store=${view.actionStore ? this.n(view.actionStore) : ""}
        .bindings=${this.a2uiBindings(view)}
        .prefix=${this.n(`a2ui_${this.slug}_`).replace(/[^\w-]/g, "_")}
      ></artifact-a2ui-view>`;
    }
    return root ? html`<sonic-sdui .props=${root}></sonic-sdui>` : html`<artifact-loader></artifact-loader>`;
  }

  render() {
    if (this.loading) {
      return html`<artifact-loader></artifact-loader>`;
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
        ${this.renderIoStatus()}
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

const STREAM_STORE_BUDGET_MS = 50;
/** Délai entre un envoi réussi d'un sink et la relecture des sources de sa collection. */
const REFRESH_SOON_MS = 300;
/** Source en direct : relecture de secours au plus une fois par minute. */
const LIVE_FALLBACK_MS = 60_000;
/** `minInterval` par défaut d'une collecte permanente côté API. */
const PERMANENT_MIN_INTERVAL_S = 3;
/** Hôte d'un appairage : relecture du code et des places prises. */
const DESK_REFRESH_MS = 10_000;
const PAIR_REFRESH_MS = 20_000;

/** Parties du document qui alimentent les DataProviders (sources, transforms) : relues si elles changent. */
function dataPart(doc: Record<string, unknown>): unknown {
  const data = (doc.data ?? {}) as {sources?: unknown; transforms?: unknown};
  return {sources: data.sources ?? null, transforms: data.transforms ?? null};
}
