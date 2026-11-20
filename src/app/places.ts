import {dispatch} from "@supersoniks/creative-stack/interactive";
import {dp, get, set} from "@supersoniks/concorde/utils";
import {loadApiBaseUrl, normalizeApiBase} from "./cloud/api-base";
import {getApiRoot, loadArtifactsAccount} from "./cloud/account";

/**
 * `data.places` : lieux partagés posés par les visiteurs à une position GPS (API Tadaaa
 * `/api/public/artifacts/{slug}/places/{nom}`). Le document ne fait aucune requête : le viewer
 *
 * - publie le DataProvider `<nom>` = {status, items, count, error, at} : lieux proches de la position lue dans
 *   `near` (DP avec `lat` / `lon`, ex. l'état de `sonic-geolocation`), du plus proche au plus lointain, chacun
 *   avec ses champs courts, `mine` (posé depuis cet appareil) et, pour les `fetch` plus proches, son corps complet ;
 * - lit la boîte d'envoi `from` (tableau du store) : `{id, op: "add", lat, lon, data}` pose un lieu,
 *   `{id, op: "delete", place}` retire un lieu posé ici (jeton gardé dans ce navigateur), `{id, op: "report", place}`
 *   le signale ; puis envoie `place:ok` {id, op, placeId} ou `place:error` {id, op, error} au store `ack`.
 *
 *   "places": {"balises": {"near": "geoState", "radius": 300, "fetch": 6, "from": "balises.outbox", "ack": "balises"}}
 */
export type PlacesDef = {
  /** Collection côté serveur (défaut : le nom) : deux DataProviders peuvent lire la même collection. */
  collection?: string;
  /** Zone d'une carte (DP : état de sonic-map, `bounds [[o, s], [e, n]]`) : lieux de la zone ou groupes, au lieu des proches. */
  area?: string;
  near?: string;
  radius?: number;
  fetch?: number;
  from?: string;
  ack?: string;
  refresh?: number;
};

type Item = Record<string, unknown> & {id: string; lat: number; lon: number; distance?: number};
type OutboxItem = {id?: unknown; op?: unknown; lat?: unknown; lon?: unknown; data?: unknown; place?: unknown};

const MOVE_M = 25;

export function startPlaces(
  slug: string,
  linkToken: string | null,
  places: Record<string, PlacesDef> | undefined,
  publishName: (name: string) => string = (n) => n,
): () => void {
  const offs: Array<() => void> = [];
  for (const [name, def] of Object.entries(places ?? {})) {
    if (!def || typeof def !== "object") continue;
    offs.push(startOne(slug, linkToken, name, def, publishName(name)));
  }
  return () => offs.forEach((off) => off());
}

function startOne(slug: string, linkToken: string | null, dpName: string, def: PlacesDef, out: string): () => void {
  const name = typeof def.collection === "string" && def.collection ? def.collection : dpName;
  if (def.area) return startArea(slug, linkToken, name, def, out);
  const tokensKey = `artifacts-places:${slug}:${name}`;
  const bodies = new Map<string, Record<string, unknown>>();
  const sent = new Set<string>();
  let last: {lat: number; lon: number} | null = null;
  let lastAt = 0;
  let running = false;
  let again = false;
  let stopped = false;
  let items: Item[] = [];
  const fetchN = Math.max(0, Math.min(20, def.fetch ?? 6));
  const refreshMs = Math.max(5, Math.min(3600, def.refresh ?? 30)) * 1000;

  const publish = (patch: Record<string, unknown>) => {
    const prev = (get(out) as Record<string, unknown> | undefined) ?? {};
    set(out, {...prev, ...patch} as never);
  };
  publish({status: "idle", items: [], count: 0, error: null});

  const position = (): {lat: number; lon: number} | null => {
    if (!def.near) return null;
    const v = get(def.near) as {lat?: unknown; lon?: unknown} | null | undefined;
    const lat = Number(v?.lat), lon = Number(v?.lon);
    return v && v.lat !== null && Number.isFinite(lat) && Number.isFinite(lon) ? {lat, lon} : null;
  };

  const refresh = async (force = false): Promise<void> => {
    if (stopped) return;
    if (running) { again = true; return; }
    const pos = position();
    if (def.near && !pos) return; // attend une position
    if (!force && pos && last && distance(pos, last) < MOVE_M && Date.now() - lastAt < refreshMs) return;
    running = true;
    try {
      publish({status: "loading"});
      const q = new URLSearchParams();
      if (linkToken) q.set("k", linkToken);
      if (pos) { q.set("lat", pos.lat.toFixed(7)); q.set("lon", pos.lon.toFixed(7)); }
      if (def.radius) q.set("radius", String(def.radius));
      const list = await call<{items: Item[]}>(`/places/${encodeURIComponent(name)}?${q}`, slug);
      const mine = tokens(tokensKey);
      const listed = Array.isArray(list?.items) ? list.items : [];
      const near = listed.slice(0, fetchN);
      for (const it of near) {
        if (stopped || bodies.has(it.id)) continue;
        try {
          const full = await call<{body?: Record<string, unknown>}>(`/places/${encodeURIComponent(name)}/${encodeURIComponent(it.id)}${linkToken ? `?k=${encodeURIComponent(linkToken)}` : ""}`, slug);
          if (full.body && typeof full.body === "object") bodies.set(it.id, full.body);
        } catch {
          /* corps indisponible : le lieu reste listé sans lui */
        }
      }
      items = listed.map((it) => ({...(bodies.get(it.id) ?? {}), ...it, id: it.id, mine: it.id in mine}));
      last = pos;
      lastAt = Date.now();
      publish({status: "ready", items, count: items.length, error: null, at: new Date().toISOString()});
    } catch (e) {
      publish({status: "error", error: message(e)});
    } finally {
      running = false;
      if (again && !stopped) { again = false; void refresh(true); }
    }
  };

  const flush = () => {
    if (!def.from) return;
    const outbox = get(def.from) as unknown;
    if (!Array.isArray(outbox)) return;
    for (const raw of outbox as OutboxItem[]) {
      if (!raw || typeof raw !== "object") continue;
      const id = typeof raw.id === "string" || typeof raw.id === "number" ? String(raw.id) : "";
      if (!id || sent.has(id)) continue;
      sent.add(id);
      const op = raw.op === "delete" || raw.op === "report" ? raw.op : "add";
      void runOp(op, raw).then(
        (placeId) => { ack({type: "place:ok", payload: {id, op, placeId, places: name}}); void refresh(true); },
        (e: unknown) => ack({type: "place:error", payload: {id, op, places: name, error: message(e)}}),
      );
    }
  };

  const runOp = async (op: string, raw: OutboxItem): Promise<string> => {
    const k = linkToken ? `?k=${encodeURIComponent(linkToken)}` : "";
    if (op === "add") {
      const data = raw.data && typeof raw.data === "object" && !Array.isArray(raw.data) ? (raw.data as Record<string, unknown>) : {};
      const lat = Number(raw.lat ?? data.lat), lon = Number(raw.lon ?? data.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("position manquante (lat, lon) : active le GPS");
      const res = await call<{id: string; deleteToken: string}>(`/places/${encodeURIComponent(name)}${k}`, slug, {method: "POST", body: JSON.stringify({lat, lon, body: data})});
      const t = tokens(tokensKey);
      t[res.id] = res.deleteToken;
      saveTokens(tokensKey, t);
      return res.id;
    }
    const place = typeof raw.place === "string" ? raw.place : "";
    if (!place) throw new Error("place : id du lieu manquant");
    if (op === "delete") {
      const t = tokens(tokensKey);
      await call(`/places/${encodeURIComponent(name)}/${encodeURIComponent(place)}${k}`, slug, {method: "DELETE", headers: t[place] ? {"X-Place-Token": t[place]} : {}});
      delete t[place];
      saveTokens(tokensKey, t);
      bodies.delete(place);
      return place;
    }
    await call(`/places/${encodeURIComponent(name)}/${encodeURIComponent(place)}/report${k}`, slug, {method: "POST"});
    return place;
  };

  const ack = (action: {type: string; payload: unknown}) => {
    if (def.ack) dispatch(def.ack, action);
  };

  const offs: Array<() => void> = [];
  const watch = (path: string | undefined, cb: () => void) => {
    if (!path) return;
    try {
      const provider = dp(path.split(".")[0]) as {onAssign?: (f: (v: unknown) => void) => void; offAssign?: (f: (v: unknown) => void) => void};
      const f = () => queueMicrotask(cb);
      provider.onAssign?.(f);
      offs.push(() => provider.offAssign?.(f));
    } catch {
      /* ignore */
    }
  };
  watch(def.near, () => void refresh());
  watch(def.from, flush);
  const timer = setInterval(() => void refresh(true), refreshMs);
  void refresh(true);
  flush();
  return () => {
    stopped = true;
    clearInterval(timer);
    offs.forEach((off) => off());
  };
}

/** Mode carte : lieux (champs courts) ou groupes de la zone visible, rechargés à chaque fin de déplacement. */
function startArea(slug: string, linkToken: string | null, name: string, def: PlacesDef, out: string): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastKey = "";
  let seq = 0;
  const publish = (patch: Record<string, unknown>) => {
    const prev = (get(out) as Record<string, unknown> | undefined) ?? {};
    set(out, {...prev, ...patch} as never);
  };
  publish({status: "idle", items: [], clusters: [], points: [], total: 0, error: null});
  const bbox = (): [number, number, number, number] | null => {
    const v = get(def.area as string) as {bounds?: unknown} | null | undefined;
    const b = v && Array.isArray(v.bounds) ? (v.bounds as unknown[]) : null;
    if (!b || b.length !== 2 || !Array.isArray(b[0]) || !Array.isArray(b[1])) return null;
    const [w, s] = (b[0] as unknown[]).map(Number), [e, n] = (b[1] as unknown[]).map(Number);
    return [w, s, e, n].every(Number.isFinite) ? [w, s, e, n] : null;
  };
  const load = async () => {
    const box = bbox();
    if (!box || stopped) return;
    const key = box.map((x) => x.toFixed(4)).join(",");
    if (key === lastKey) return;
    lastKey = key;
    const mine = ++seq;
    publish({status: "loading"});
    try {
      const q = new URLSearchParams({bbox: key});
      if (linkToken) q.set("k", linkToken);
      const res = await call<{items: Item[]; clusters: {lat: number; lon: number; count: number}[]; total: number}>(`/places/${encodeURIComponent(name)}?${q}`, slug);
      if (stopped || mine !== seq) return;
      const found = Array.isArray(res?.items) ? res.items : [];
      const groups = Array.isArray(res?.clusters) ? res.clusters : [];
      const points = [
        ...found.map((it) => ({...it, label: typeof it.message === "string" ? it.message : undefined})),
        ...groups.map((c, i) => ({id: `groupe-${i}`, lat: c.lat, lon: c.lon, count: c.count, label: String(c.count), groupe: true})),
      ];
      publish({status: "ready", items: found, clusters: groups, points, total: Number(res?.total) || found.length, error: null, at: new Date().toISOString()});
    } catch (e) {
      if (mine === seq) publish({status: "error", error: message(e)});
    }
  };
  let off: (() => void) | null = null;
  try {
    const provider = dp((def.area as string).split(".")[0]) as {onAssign?: (f: (v: unknown) => void) => void; offAssign?: (f: (v: unknown) => void) => void};
    const f = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(), 250);
    };
    provider.onAssign?.(f);
    off = () => provider.offAssign?.(f);
  } catch {
    /* ignore */
  }
  void load();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    off?.();
  };
}

async function call<T>(path: string, slug: string, init: RequestInit = {}): Promise<T> {
  const base = `${normalizeApiBase(loadApiBaseUrl())}/api`;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  // Membre connecté : jeton joint seulement vers l'hôte de l'API (modération, retrait de ses lieux).
  const acc = loadArtifactsAccount();
  try {
    if (acc?.token && new URL(getApiRoot(acc), location.href).origin === new URL(base, location.href).origin) headers.set("Authorization", `Bearer ${acc.token}`);
  } catch {
    /* envoi anonyme */
  }
  const res = await fetch(`${base}/public/artifacts/${encodeURIComponent(slug)}${path}`, {...init, headers});
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as {detail?: string; title?: string; error?: string};
      msg = j.detail || j.error || j.title || msg;
    } catch {
      /* corps non JSON */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function tokens(key: string): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "{}") as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveTokens(key: string, t: Record<string, string>): void {
  try {
    localStorage.setItem(key, JSON.stringify(t));
  } catch {
    /* stockage indisponible : le lieu ne pourra être retiré que par un membre */
  }
}

function distance(a: {lat: number; lon: number}, b: {lat: number; lon: number}): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const x = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371008.8 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function message(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 200);
}
