import {dispatch} from "@supersoniks/creative-stack/interactive";
import {dp, get, set} from "@supersoniks/concorde/utils";
import {loadApiBaseUrl, normalizeApiBase} from "./cloud/api-base";
import {applyPatch, setPointer, type PatchOp} from "./json-patch";
import {ScorePlayer, type Score} from "./score-player";

/**
 * Flux d'un run (`io.stream` du contrat) côté viewer : le viewer qui exécute le run (jeton `rt`)
 * et les spectateurs (jeton `wt`) rejoignent le flux, appliquent les messages de l'émetteur et
 * restent synchrones.
 *
 * - Rejoindre : `GET …/runs/{id}/stream?rt|wt=` → identifiants Mercure, document courant (si le flux
 *   l'a modifié), partition en cours, dernier instantané d'état et messages à rejouer.
 * - Suivre : EventSource sur le topic `in` du hub Mercure ; trou dans les numéros ou hub
 *   indisponible → rattrapage `?after=<seq>` (et suivi par relecture toutes les secondes).
 * - Le viewer du run publie un instantané d'état (spectateurs arrivés en cours) et la
 *   progression `io.stream.progress`.
 */
export type StreamMessage = {
  seq: number;
  t: number;
  type: string;
  name?: string;
  payload?: unknown;
  state?: unknown;
  patch?: PatchOp[];
  score?: Score;
};

export type StreamJoin = {
  runId: string;
  role: "performer" | "watcher" | "emitter";
  status: string;
  seq: number;
  ended: boolean;
  serverTime: number;
  events: StreamMessage[];
  complete: boolean;
  store?: string | null;
  stream?: {rate?: number; progress?: boolean} | null;
  snapshot?: {seq: number; state: unknown} | null;
  score?: {score: Score; t: number; seq: number} | null;
  document?: Record<string, unknown>;
  input?: unknown;
  mercure?: {hubUrl: string; token: string; topics: {in: string; out: string}; expiresIn: number} | null;
};

export type StreamStatus = {transport: "mercure" | "polling" | "off"; seq: number; ended: boolean; closed?: string};

export type RunStreamOptions = {
  slug: string;
  runId: string;
  /** Jeton du run (`rt`, viewer qui l'exécute) ou de spectateur (`wt`). */
  token: string;
  role: "performer" | "watcher";
  join: StreamJoin;
  /** Store (id résolu) qui reçoit les actions. */
  storeId: string;
  /** DataProvider (nom résolu) de l'état de ce store. */
  stateDp: string;
  /** Spectateur sans instantané : entrée du run à envoyer au store (le viewer du run le fait déjà). */
  input?: {action: string; payload: unknown} | null;
  /** Progression publiée par le viewer du run : chemin résolu `dp.chemin` et intervalle (ms). */
  progress?: {path: string; every: number} | null;
  applyDocumentPatch: (patch: PatchOp[]) => Promise<void> | void;
  /** Message `end` reçu (le viewer du run publie alors sa sortie). */
  onEnd: () => void;
  onStatus?: (s: StreamStatus) => void;
};

const POLL_MS = 1000;
const SNAPSHOT_MS = 5000;
const MAX_SNAPSHOT_BYTES = 30_000;

export function streamUrl(slug: string, runId: string): string {
  return `${normalizeApiBase(loadApiBaseUrl())}/api/public/artifacts/${encodeURIComponent(slug)}/runs/${encodeURIComponent(runId)}`;
}

/** Rejoindre le flux (`after` ≥ 0 : seulement les messages suivants). */
export async function joinStream(slug: string, runId: string, token: string, role: "performer" | "watcher", after = -1): Promise<StreamJoin> {
  const q = new URLSearchParams({[role === "watcher" ? "wt" : "rt"]: token});
  if (after >= 0) q.set("after", String(after));
  const res = await fetch(`${streamUrl(slug, runId)}/stream?${q}`, {headers: {Accept: "application/json"}});
  if (!res.ok) {
    let msg = "Flux introuvable (lien invalide ?).";
    try {
      const j = (await res.json()) as {detail?: string; error?: string};
      msg = j.detail || j.error || msg;
    } catch {
      /* corps illisible */
    }
    throw new Error(msg);
  }
  return (await res.json()) as StreamJoin;
}

/** Spectateur : `?run=<id>&wt=<jeton>` sur la page. */
export function watchFromLocation(search: string): {id: string; token: string} | null {
  const q = new URLSearchParams(search);
  const id = q.get("run") ?? "";
  const token = q.get("wt") ?? "";
  return /^[0-9a-fA-F-]{36}$/.test(id) && token ? {id, token} : null;
}

export class RunStream {
  private lastSeq: number;
  private offset: number;
  private chain: Promise<void> = Promise.resolve();
  private source: EventSource | null = null;
  private pollTimer = 0;
  private renewTimer = 0;
  private snapTimer = 0;
  private progressTimer = 0;
  private progressOff: (() => void) | null = null;
  private lastProgress = 0;
  private lastSnapSeq = -1;
  private lastSnapJson = "";
  private stopped = false;
  private ended = false;
  private catchingUp = false;
  private errors = 0;
  private transport: StreamStatus["transport"] = "off";
  readonly player: ScorePlayer;

  constructor(private readonly opts: RunStreamOptions) {
    const j = opts.join;
    this.offset = j.serverTime - Date.now();
    this.lastSeq = j.snapshot?.seq ?? 0;
    this.player = new ScorePlayer({
      now: () => Date.now() + this.offset,
      write: (values) => {
        let state = this.readState();
        for (const v of values) state = setPointer(state, v.path, v.value);
        this.writeState(state);
      },
      dispatch: (action, payload) => dispatch(opts.storeId, {type: action, payload: payload ?? null}),
      rate: 30,
    });
  }

  /** Applique l'état de départ puis s'abonne. */
  async start(): Promise<void> {
    const j = this.opts.join;
    if (j.snapshot && j.snapshot.state && typeof j.snapshot.state === "object") {
      this.writeState(j.snapshot.state);
    } else if (this.opts.role === "watcher" && this.opts.input) {
      dispatch(this.opts.storeId, {type: this.opts.input.action, payload: clone(this.opts.input.payload)});
    }
    for (const m of j.events ?? []) await this.apply(m);
    this.lastSeq = Math.max(this.lastSeq, j.seq);
    if (j.score?.score) this.player.play(j.score.score, j.score.t);
    if (j.ended) this.end();
    if (this.opts.role === "performer") this.startPerformer();
    this.subscribe(j);
  }

  stop(): void {
    this.stopped = true;
    this.player.stop();
    this.source?.close();
    this.source = null;
    clearInterval(this.pollTimer);
    clearTimeout(this.renewTimer);
    clearInterval(this.snapTimer);
    clearTimeout(this.progressTimer);
    this.progressOff?.();
  }

  get seq(): number {
    return this.lastSeq;
  }

  /* ------------------------------------------------------------ abonnement */

  private subscribe(j: StreamJoin): void {
    if (this.stopped || j.status !== "pending") {
      this.status(j.status !== "pending" ? j.status : undefined);
      return;
    }
    clearTimeout(this.renewTimer);
    const m = j.mercure;
    if (m?.hubUrl && typeof EventSource !== "undefined") {
      this.source?.close();
      const url = new URL(m.hubUrl);
      url.searchParams.append("topic", m.topics.in);
      url.searchParams.set("authorization", m.token);
      const es = new EventSource(url.toString());
      const onData = (e: MessageEvent) => {
        this.errors = 0;
        try {
          const data = JSON.parse(String(e.data)) as {events?: StreamMessage[]};
          this.receive(data.events ?? []);
        } catch {
          /* message illisible : ignoré */
        }
      };
      es.addEventListener("stream", onData as EventListener);
      es.onmessage = onData;
      es.onopen = () => {
        this.errors = 0;
        this.setTransport("mercure");
        // Messages publiés pendant la connexion : rattrapage.
        void this.catchUp();
      };
      es.onerror = () => {
        if (++this.errors >= 3 && es.readyState !== EventSource.OPEN) {
          es.close();
          if (this.source === es) this.source = null;
          this.startPolling();
        }
      };
      this.source = es;
      clearInterval(this.pollTimer);
      this.pollTimer = 0;
      // Jeton d'abonné : renouvelé une minute avant son expiration (avec rattrapage).
      const ttl = Math.max(60, (m.expiresIn || 3600) - 60) * 1000;
      this.renewTimer = window.setTimeout(() => void this.renew(), ttl);
    } else {
      this.startPolling();
    }
  }

  private startPolling(): void {
    if (this.stopped || this.pollTimer) return;
    this.setTransport("polling");
    this.pollTimer = window.setInterval(() => void this.catchUp(), POLL_MS);
  }

  private async renew(): Promise<void> {
    if (this.stopped) return;
    try {
      const j = await joinStream(this.opts.slug, this.opts.runId, this.opts.token, this.opts.role, this.lastSeq);
      this.receive(j.events ?? []);
      this.subscribe(j);
    } catch {
      this.renewTimer = window.setTimeout(() => void this.renew(), 15_000);
    }
  }

  /** Messages depuis le dernier appliqué (trou, reconnexion, suivi sans Mercure). */
  private async catchUp(): Promise<void> {
    if (this.stopped || this.catchingUp) return;
    this.catchingUp = true;
    try {
      const j = await joinStream(this.opts.slug, this.opts.runId, this.opts.token, this.opts.role, this.lastSeq);
      this.offset = j.serverTime - Date.now();
      this.receive(j.events ?? []);
      if (j.status !== "pending") {
        this.status(j.status);
        this.stop();
      }
    } catch {
      /* réseau : réessai au prochain tour */
    } finally {
      this.catchingUp = false;
    }
  }

  private receive(events: StreamMessage[]): void {
    const sorted = [...events].sort((a, b) => a.seq - b.seq);
    for (const m of sorted) {
      if (m.seq <= this.lastSeq) continue;
      if (m.seq > this.lastSeq + 1) {
        // Trou : on rattrape dans l'ordre (le message reviendra avec les autres).
        void this.catchUp();
        return;
      }
      this.lastSeq = m.seq;
      this.chain = this.chain.then(() => this.apply(m)).catch(() => {});
    }
    this.status();
  }

  /* ------------------------------------------------------------ messages */

  private async apply(m: StreamMessage): Promise<void> {
    if (this.stopped) return;
    switch (m.type) {
      case "action":
        if (m.name) dispatch(this.opts.storeId, {type: m.name, payload: m.payload ?? null});
        break;
      case "state.snapshot":
        if (m.state && typeof m.state === "object") this.writeState(m.state);
        break;
      case "state.delta":
        try {
          this.writeState(applyPatch(this.readState(), m.patch ?? []));
        } catch (e) {
          console.warn("[flux] state.delta ignoré :", e instanceof Error ? e.message : e);
        }
        break;
      case "document.patch":
        try {
          await this.opts.applyDocumentPatch(m.patch ?? []);
        } catch (e) {
          console.warn("[flux] document.patch ignoré :", e instanceof Error ? e.message : e);
        }
        break;
      case "score":
        if (m.score) this.player.play(m.score, m.t, true);
        break;
      case "score.stop":
        this.player.stop();
        break;
      case "end":
        this.end();
        break;
    }
  }

  private end(): void {
    if (this.ended) return;
    this.ended = true;
    this.status();
    this.opts.onEnd();
  }

  private readState(): Record<string, unknown> {
    const v = get(this.opts.stateDp) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const copy = clone(v as Record<string, unknown>);
    delete copy.lastError;
    return copy;
  }

  private writeState(state: unknown): void {
    set(this.opts.stateDp, clone(state) as never);
  }

  private setTransport(t: StreamStatus["transport"]): void {
    this.transport = t;
    this.status();
  }

  private status(closed?: string): void {
    this.opts.onStatus?.({transport: this.transport, seq: this.lastSeq, ended: this.ended, closed});
  }

  /* ------------------------------------------------------------ viewer du run */

  private startPerformer(): void {
    // Instantané d'état pour les spectateurs qui arrivent en cours (seulement s'il a changé).
    this.snapTimer = window.setInterval(() => void this.postSnapshot(), SNAPSHOT_MS);
    const p = this.opts.progress;
    if (!p) return;
    const root = p.path.split(".")[0];
    try {
      const provider = dp(root) as {onAssign?: (cb: () => void) => void; offAssign?: (cb: () => void) => void};
      const cb = () => this.scheduleProgress();
      provider.onAssign?.(cb);
      this.progressOff = () => provider.offAssign?.(cb);
    } catch {
      /* DataProvider indisponible */
    }
  }

  private scheduleProgress(): void {
    const p = this.opts.progress;
    if (!p || this.progressTimer || this.stopped) return;
    const wait = Math.max(0, this.lastProgress + p.every - Date.now());
    this.progressTimer = window.setTimeout(() => {
      this.progressTimer = 0;
      this.lastProgress = Date.now();
      const value = clone(get(p.path) as unknown);
      void this.postOut([{type: "progress", value: value === undefined ? null : value}]);
    }, wait);
  }

  private async postSnapshot(): Promise<void> {
    if (this.stopped) return;
    const state = this.readState();
    const json = JSON.stringify(state);
    if (json.length > MAX_SNAPSHOT_BYTES) return;
    if (this.lastSeq === this.lastSnapSeq && json === this.lastSnapJson) return;
    this.lastSnapSeq = this.lastSeq;
    this.lastSnapJson = json;
    await this.postOut([{type: "snapshot", seq: this.lastSeq, state}]);
  }

  private async postOut(events: unknown[]): Promise<void> {
    try {
      await fetch(`${streamUrl(this.opts.slug, this.opts.runId)}/stream`, {
        method: "POST",
        headers: {Accept: "application/json", "Content-Type": "application/json"},
        body: JSON.stringify({rt: this.opts.token, events}),
      });
    } catch {
      /* best effort : la progression suivante repartira */
    }
  }
}

function clone<T>(v: T): T {
  try {
    return JSON.parse(JSON.stringify(v)) as T;
  } catch {
    return v;
  }
}
