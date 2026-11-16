/**
 * Sauvegarde en ligne d'un artefact (`data.persist.online: true`) : l'état des DataProviders de `data.persist` est
 * envoyé à Tadaaa et retrouvé sur un autre appareil.
 *
 *   "data": {"persist": {"providers": ["chambre", "piece"], "version": 2, "online": true, "status": "sauvegarde"}}
 *
 * - sans compte : chaque appareil a une clé secrète ; le lien `?save=<clé>` (publié dans le DataProvider `status`)
 *   ouvre la même sauvegarde ailleurs ;
 * - connecté : la sauvegarde est rattachée au compte et suit celui-ci (la plus récente du compte l'emporte au
 *   chargement).
 *
 * Au chargement, la sauvegarde distante plus récente que celle de l'appareil remplace la sauvegarde locale avant que
 * les stores démarrent ; ensuite chaque changement est envoyé, 2 s après le dernier.
 */
import {loadApiBaseUrl, normalizeApiBase} from "./cloud/api-base";
import {loadArtifactsAccount, getApiRoot} from "./cloud/account";

export type SaveStatus = {
  /** `local` (pas encore envoyée), `envoi`, `ok`, `erreur`, `hors-ligne`. */
  etat: "local" | "envoi" | "ok" | "erreur" | "hors-ligne";
  /** Lien qui ouvre cette sauvegarde sur un autre appareil. */
  lien: string;
  /** Rattachée à un compte. */
  compte: boolean;
  /** Dernier envoi réussi (ISO), vide sinon. */
  maj: string;
  message: string;
};

type Meta = {revision: number; dirty: boolean};
type Remote = {data: Record<string, unknown>; revision: number; updatedAt: string; owned: boolean};

const KEY_RE = /^[A-Za-z0-9_-]{22,64}$/;

/** Sauvegarde en ligne demandée par le document. */
export function onlineDecl(doc: unknown): {status: string} | null {
  const p = (doc as {data?: {persist?: {online?: unknown; status?: unknown}}} | null)?.data?.persist;
  if (!p || p.online !== true) return null;
  const status = typeof p.status === "string" && /^[A-Za-z][\w-]{0,63}$/.test(p.status) ? p.status : "";
  return {status};
}

function randomKey(): string {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function store(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function keep(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* stockage indisponible */
  }
}

export class OnlineSave {
  readonly key: string;
  private meta: Meta;
  private timer = 0;
  private inflight = false;
  private again = false;
  status: SaveStatus;

  constructor(
    private readonly slug: string,
    private readonly artifactId: string,
    private readonly linkToken: string | null,
    private readonly collect: () => Record<string, unknown>,
    private readonly onStatus: (s: SaveStatus) => void,
  ) {
    // `?save=<clé>` : cet appareil reprend la sauvegarde d'un autre (puis le paramètre quitte l'adresse)
    const url = new URL(location.href);
    const fromUrl = url.searchParams.get("save");
    const stored = store(this.keyName);
    if (fromUrl && KEY_RE.test(fromUrl)) {
      this.key = fromUrl;
      keep(this.keyName, fromUrl);
      if (fromUrl !== stored) keep(this.metaName, JSON.stringify({revision: 0, dirty: false}));
      url.searchParams.delete("save");
      history.replaceState(history.state, "", url.toString());
    } else if (stored && KEY_RE.test(stored)) {
      this.key = stored;
    } else {
      this.key = randomKey();
      keep(this.keyName, this.key);
    }
    let meta: Meta = {revision: 0, dirty: false};
    try {
      const m = JSON.parse(store(this.metaName) ?? "") as Partial<Meta>;
      meta = {revision: Number.isInteger(m.revision) ? (m.revision as number) : 0, dirty: m.dirty === true};
    } catch {
      /* pas encore de méta */
    }
    this.meta = meta;
    this.status = {etat: "local", lien: this.link(), compte: !!loadArtifactsAccount()?.token, maj: "", message: ""};
  }

  private get keyName() {
    return `artefacts:savekey:${this.artifactId}`;
  }

  private get metaName() {
    return `artefacts:savemeta:${this.artifactId}`;
  }

  /** Lien à ouvrir sur un autre appareil. */
  private link(): string {
    const u = new URL(location.href);
    u.hash = "";
    u.searchParams.set("save", this.key);
    if (this.linkToken) u.searchParams.set("k", this.linkToken);
    return u.toString();
  }

  private setStatus(p: Partial<SaveStatus>) {
    this.status = {...this.status, ...p};
    this.onStatus(this.status);
  }

  private saveMeta() {
    keep(this.metaName, JSON.stringify(this.meta));
  }

  private async call(path: string, init: RequestInit = {}): Promise<Response> {
    const acc = loadArtifactsAccount();
    const headers = new Headers({Accept: "application/json"});
    if (init.body) headers.set("Content-Type", "application/json");
    const base = acc ? getApiRoot(acc) : `${normalizeApiBase(loadApiBaseUrl())}/api`;
    // le jeton du compte ne part que vers l'API
    if (acc?.token) headers.set("Authorization", `Bearer ${acc.token}`);
    const q = this.linkToken ? `?k=${encodeURIComponent(this.linkToken)}` : "";
    return fetch(`${base}/public/artifacts/${encodeURIComponent(this.slug)}/saves/${path}${q}`, {...init, headers});
  }

  private async get(path: string): Promise<Remote | null> {
    const res = await this.call(path);
    if (res.status === 404 || res.status === 401) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Remote;
  }

  /**
   * Sauvegarde distante à reprendre (plus récente que celle de l'appareil et sans changement local non envoyé),
   * `null` sinon. Ne lève jamais : hors ligne, l'appareil garde la sienne.
   */
  async pull(timeoutMs = 4000): Promise<Record<string, unknown> | null> {
    const logged = !!loadArtifactsAccount()?.token;
    try {
      const remote = await Promise.race([
        (async () => (logged ? ((await this.get("me")) ?? (await this.get(this.key))) : await this.get(this.key)))(),
        new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
      ]);
      if (!remote) return null;
      this.status = {...this.status, compte: remote.owned, maj: remote.updatedAt, etat: "ok"};
      if (this.meta.dirty && remote.revision <= this.meta.revision) return null;
      if (remote.revision === this.meta.revision && !this.meta.dirty) return null;
      this.meta = {revision: remote.revision, dirty: false};
      this.saveMeta();
      return remote.data && typeof remote.data === "object" ? remote.data : null;
    } catch {
      this.status = {...this.status, etat: "hors-ligne"};
      return null;
    }
  }

  /** Un DataProvider sauvegardé a changé : envoi 2 s après le dernier changement. */
  changed() {
    if (!this.meta.dirty) {
      this.meta.dirty = true;
      this.saveMeta();
    }
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.push(), 2000);
  }

  /** Envoi immédiat (fermeture de la page, changement de document). */
  flush() {
    if (!this.meta.dirty) return;
    clearTimeout(this.timer);
    void this.push(true);
  }

  private async push(keepalive = false) {
    if (this.inflight) {
      this.again = true;
      return;
    }
    this.inflight = true;
    this.setStatus({etat: "envoi"});
    try {
      const body = JSON.stringify({data: this.collect()});
      let res = await this.call(this.key, {method: "POST", body, keepalive: keepalive && body.length < 60000});
      // clé déjà rattachée à un autre compte : la sauvegarde du compte connecté
      if (res.status === 403 && loadArtifactsAccount()?.token) res = await this.call("me", {method: "POST", body});
      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const j = (await res.json()) as {detail?: string; error?: string};
          message = j.detail || j.error || message;
        } catch {
          /* corps non JSON */
        }
        this.setStatus({etat: "erreur", message});
        return;
      }
      const r = (await res.json()) as {revision: number; updatedAt: string; owned: boolean};
      this.meta = {revision: r.revision, dirty: this.again};
      this.saveMeta();
      this.setStatus({etat: "ok", maj: r.updatedAt, compte: r.owned, message: ""});
    } catch {
      this.setStatus({etat: "hors-ligne"});
    } finally {
      this.inflight = false;
      if (this.again) {
        this.again = false;
        this.changed();
      }
    }
  }

  dispose() {
    this.flush();
    clearTimeout(this.timer);
  }
}
