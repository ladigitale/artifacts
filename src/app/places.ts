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
 *   le signale, `{id, op: "addRef", place, ref}` lui ajoute une surface de remplacement ; `message` et `addRef`
 *   joignent la position de `near` (`at` : lat, lon, accuracy, et `seen` de l'op) : le serveur n'accepte vocal,
 *   dessin et surface que sur place, un texte envoyé de loin devient un commentaire à distance (`onSite: false`) ; puis envoie `place:ok` {id, op, placeId} ou `place:error` {id, op, error} au store `ack`.
 * - parcours : une entrée `{collection, routes: "carteState", route: "dp.id"}` publie `<nom>Routes` (parcours de
 *   la zone visible, `lines` GeoJSON) et `<nom>Route` (parcours choisi, `sounds` des sons propres) ; ops de la
 *   boîte d'envoi principale `addRoute` {data: {title, ordered, mode, steps}}, `deleteRoute` et `reportRoute` {route}.
 *
 *   "places": {"balises": {"near": "geoState", "radius": 300, "fetch": 6, "from": "balises.outbox", "ack": "balises"}}
 */
export type PlacesDef = {
  /** Collection côté serveur (défaut : le nom) : deux DataProviders peuvent lire la même collection. */
  collection?: string;
  /** Zone d'une carte (DP : état de sonic-map, `bounds [[o, s], [e, n]]`) : lieux de la zone ou groupes, au lieu des proches. */
  /** DP donnant l'id d'un lieu : sa discussion est publiée dans `<nom>Fil` (rechargée toutes les 15 s). */
  thread?: string;
  /** Parcours de la zone d'une carte (DP : état de sonic-map) : publiés dans `<nom>Routes` (items, lines GeoJSON). */
  routes?: string;
  /** DP donnant l'id d'un parcours : publié avec ses sons propres dans `<nom>Route`. */
  route?: string;
  area?: string;
  near?: string;
  radius?: number;
  fetch?: number;
  from?: string;
  ack?: string;
  refresh?: number;
};

type Item = Record<string, unknown> & {id: string; lat: number; lon: number; distance?: number};
type OutboxItem = {route?: unknown; id?: unknown; op?: unknown; lat?: unknown; lon?: unknown; data?: unknown; place?: unknown; ref?: unknown; text?: unknown; media?: unknown; pseudo?: unknown; message?: unknown; seen?: unknown; cadre?: unknown};
type ThreadMessage = {id: string; kind: string; text?: string; pseudo?: string | null; at?: string; origin?: boolean; hasMedia?: boolean; media?: string; mine?: boolean};
const OPS = ["delete", "report", "addRef", "message", "reportMessage", "addRoute", "deleteRoute", "reportRoute"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (def.area || def.routes || def.route) {
    const offs: Array<() => void> = [];
    if (def.area) offs.push(startArea(slug, linkToken, name, def, out));
    if (def.routes || def.route) offs.push(startRoutes(slug, linkToken, name, def, out));
    return () => offs.forEach((off) => off());
  }
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

  /** Position jointe aux ops faites sur place (message, addRef) : le serveur vérifie la distance au lieu. */
  const here = (seen: boolean): {lat: number; lon: number; accuracy?: number; seen: boolean} | undefined => {
    const pos = position();
    if (!pos) return undefined;
    const acc = Number((get(def.near!) as {accuracy?: unknown} | null | undefined)?.accuracy);
    return {...pos, ...(Number.isFinite(acc) ? {accuracy: acc} : {}), seen};
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
      const op = typeof raw.op === "string" && OPS.includes(raw.op) ? raw.op : "add";
      void runOp(op, raw).then(
        (placeId) => { ack({type: "place:ok", payload: {id, op, placeId, ...(op.endsWith("Route") ? {routeId: placeId} : {}), places: name}}); void refresh(true); },
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
    if (op === "addRoute" || op === "deleteRoute" || op === "reportRoute") return runRouteOp(op, raw, k);
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
    if (op === "message") {
      const text = typeof raw.text === "string" ? raw.text : "";
      const media = await asDataUrl(raw.media);
      if (!text.trim() && !media) throw new Error("message vide");
      const res = await call<{id: string; deleteToken: string}>(`/places/${encodeURIComponent(name)}/${encodeURIComponent(place)}/messages${k}`, slug, {
        method: "POST",
        body: JSON.stringify({text, media, pseudo: typeof raw.pseudo === "string" ? raw.pseudo : undefined, at: here(raw.seen === true), cadre: typeof raw.cadre === "number" ? raw.cadre : undefined}),
      });
      const t = tokens(msgKey);
      t[res.id] = res.deleteToken;
      saveTokens(msgKey, t);
      void loadThread(true);
      return res.id;
    }
    if (op === "reportMessage") {
      const message = typeof raw.message === "string" ? raw.message : "";
      if (!message) throw new Error("message : id manquant");
      await call(`/places/${encodeURIComponent(name)}/${encodeURIComponent(place)}/messages/${encodeURIComponent(message)}${k}`, slug, {method: "POST"});
      void loadThread(true);
      return message;
    }
    if (op === "addRef") {
      if (!raw.ref || typeof raw.ref !== "object" || Array.isArray(raw.ref)) throw new Error("ref : nouvelle surface manquante");
      await call(`/places/${encodeURIComponent(name)}/${encodeURIComponent(place)}/refs${k}`, slug, {method: "POST", body: JSON.stringify({ref: raw.ref, at: here(false)})});
      bodies.delete(place); // le corps rechargé portera la nouvelle surface
      return place;
    }
    await call(`/places/${encodeURIComponent(name)}/${encodeURIComponent(place)}/report${k}`, slug, {method: "POST"});
    return place;
  };

  const routeKey = `${tokensKey}:routes`;
  const runRouteOp = async (op: string, raw: OutboxItem, k: string): Promise<string> => {
    const base = `/places/${encodeURIComponent(name)}/routes`;
    if (op === "addRoute") {
      const data = raw.data && typeof raw.data === "object" && !Array.isArray(raw.data) ? (raw.data as Record<string, unknown>) : null;
      const steps = data && Array.isArray(data.steps) ? (data.steps as unknown[]) : [];
      if (!data || steps.length < 2) throw new Error("parcours : au moins deux étapes");
      const out: Record<string, unknown>[] = [];
      for (const st of steps) {
        const o = st && typeof st === "object" ? {...(st as Record<string, unknown>)} : {};
        if (o.sound === "propre") o.media = await asDataUrl(o.media);
        else delete o.media;
        out.push(o);
      }
      const res = await call<{id: string; deleteToken: string}>(`${base}${k}`, slug, {method: "POST", body: JSON.stringify({...data, steps: out})});
      const t = tokens(routeKey);
      t[res.id] = res.deleteToken;
      saveTokens(routeKey, t);
      return res.id;
    }
    const route = typeof raw.route === "string" && UUID.test(raw.route) ? raw.route : "";
    if (!route) throw new Error("route : id du parcours manquant");
    if (op === "deleteRoute") {
      const t = tokens(routeKey);
      await call(`${base}/${route}${k}`, slug, {method: "DELETE", headers: t[route] ? {"X-Place-Token": t[route]} : {}});
      delete t[route];
      saveTokens(routeKey, t);
      return route;
    }
    await call(`${base}/${route}/report${k}`, slug, {method: "POST"});
    return route;
  };

  const ack = (action: {type: string; payload: unknown}) => {
    if (def.ack) dispatch(def.ack, action);
  };

  // ---- discussion du lieu choisi (def.thread) ----
  const msgKey = `${tokensKey}:messages`;
  const threadOut = `${out}Fil`;
  const media = new Map<string, string>();
  let threadPlace = "";
  let threadBusy = false;
  const threadTarget = (): string => {
    if (!def.thread) return "";
    const v = get(def.thread) as unknown;
    return typeof v === "string" && /^[0-9a-fA-F-]{36}$/.test(v) ? v : "";
  };
  const publishThread = (patch: Record<string, unknown>) => {
    const prev = (get(threadOut) as Record<string, unknown> | undefined) ?? {};
    set(threadOut, {...prev, ...patch} as never);
  };
  const loadThread = async (force = false): Promise<void> => {
    if (!def.thread || stopped) return;
    const place = threadTarget();
    if (!place) {
      if (threadPlace) publishThread({place: null, status: "idle", messages: [], drawings: [], count: 0, error: null});
      threadPlace = "";
      return;
    }
    if (place === threadPlace && (threadBusy || !force)) return;
    const changed = place !== threadPlace;
    threadPlace = place;
    threadBusy = true;
    if (changed) publishThread({place, status: "loading", messages: [], drawings: [], count: 0, error: null});
    try {
      const k = linkToken ? `?k=${encodeURIComponent(linkToken)}` : "";
      const res = await call<{messages?: ThreadMessage[]; count?: number}>(`/places/${encodeURIComponent(name)}/${encodeURIComponent(place)}/messages${k}`, slug);
      if (stopped || threadPlace !== place) return;
      const mine = tokens(msgKey);
      const list = (Array.isArray(res?.messages) ? res.messages : []).map((m) => ({...m, mine: m.id in mine, media: m.media ?? media.get(m.id)}));
      const publishList = () => {
        const msgs = list.map((m) => ({...m, media: m.media ?? media.get(m.id)}));
        publishThread({place, status: "ready", messages: msgs, drawings: msgs.filter((m) => m.kind === "drawing" && m.media), count: msgs.length, error: null, at: new Date().toISOString()});
      };
      publishList();
      // Vocaux et dessins : chargés à part, une fois.
      for (const m of list) {
        if (stopped || threadPlace !== place) return;
        if (!m.hasMedia || media.has(m.id)) continue;
        try {
          const r = await call<{media?: string}>(`/places/${encodeURIComponent(name)}/${encodeURIComponent(place)}/messages/${encodeURIComponent(m.id)}${k}`, slug);
          if (typeof r?.media === "string") media.set(m.id, r.media);
        } catch {
          /* média indisponible : le message reste listé */
        }
      }
      publishList();
    } catch (e) {
      if (threadPlace === place) publishThread({status: "error", error: message(e)});
    } finally {
      threadBusy = false;
    }
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
  watch(def.thread, () => void loadThread());
  const threadTimer = def.thread ? setInterval(() => void loadThread(true), 15000) : null;
  const timer = setInterval(() => void refresh(true), refreshMs);
  void refresh(true);
  flush();
  return () => {
    stopped = true;
    clearInterval(timer);
    if (threadTimer) clearInterval(threadTimer);
    offs.forEach((off) => off());
  };
}

type RouteStep = {index: number; place: string; lat: number; lon: number; radius: number; sound: string; hasSound?: boolean};
type RouteRow = Record<string, unknown> & {id: string; title?: string; steps?: RouteStep[]};

/**
 * Parcours : ceux de la zone d'une carte (`routes`, publiés dans `<nom>Routes` avec un tracé GeoJSON prêt pour un
 * patch de style de sonic-map) et le parcours choisi (`route`, publié dans `<nom>Route` avec ses sons propres).
 */
function startRoutes(slug: string, linkToken: string | null, name: string, def: PlacesDef, out: string): () => void {
  let stopped = false;
  const offs: Array<() => void> = [];
  const q = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams(extra);
    if (linkToken) p.set("k", linkToken);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const base = `/places/${encodeURIComponent(name)}/routes`;
  const listen = (path: string, f: () => void) => {
    try {
      const provider = dp(path.split(".")[0]) as {onAssign?: (f: (v: unknown) => void) => void; offAssign?: (f: (v: unknown) => void) => void};
      provider.onAssign?.(f);
      offs.push(() => provider.offAssign?.(f));
    } catch {
      /* ignore */
    }
  };

  if (def.routes) {
    const dpOut = `${out}Routes`;
    set(dpOut, {status: "idle", items: [], lines: {type: "FeatureCollection", features: []}, error: null} as never);
    let lastKey = "";
    let seq = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async (force = false) => {
      const v = get(def.routes as string) as {bounds?: unknown} | null | undefined;
      const b = v && Array.isArray(v.bounds) ? (v.bounds as unknown[]) : null;
      if (!b || b.length !== 2 || !Array.isArray(b[0]) || !Array.isArray(b[1]) || stopped) return;
      const box = [...(b[0] as unknown[]), ...(b[1] as unknown[])].map(Number);
      if (!box.every(Number.isFinite)) return;
      const key = box.map((x) => x.toFixed(4)).join(",");
      if (key === lastKey && !force) return;
      lastKey = key;
      const mine = ++seq;
      try {
        const res = await call<{items?: RouteRow[]}>(`${base}${q({bbox: key})}`, slug);
        if (stopped || mine !== seq) return;
        const items = Array.isArray(res?.items) ? res.items : [];
        const features = items.map((r) => ({
          type: "Feature",
          properties: {id: r.id, title: r.title ?? ""},
          geometry: {type: "LineString", coordinates: (r.steps ?? []).map((st) => [Number(st.lon), Number(st.lat)])},
        }));
        set(dpOut, {status: "ready", items, lines: {type: "FeatureCollection", features}, error: null, at: new Date().toISOString()} as never);
      } catch (e) {
        if (mine === seq) set(dpOut, {...((get(dpOut) as object) ?? {}), status: "error", error: message(e)} as never);
      }
    };
    listen(def.routes, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(), 250);
    });
    void load();
    const every = setInterval(() => void load(true), 60000);
    offs.push(() => { clearInterval(every); if (timer) clearTimeout(timer); });
  }

  if (def.route) {
    const dpOut = `${out}Route`;
    set(dpOut, {status: "idle", route: null, sounds: {}, error: null} as never);
    let current = "";
    let seq = 0;
    const target = (): string => {
      const v = get(def.route as string) as unknown;
      const id = typeof v === "string" ? v : v && typeof v === "object" && typeof (v as {id?: unknown}).id === "string" ? String((v as {id: string}).id) : "";
      return UUID.test(id) ? id : "";
    };
    const load = async () => {
      const id = target();
      if (id === current || stopped) return;
      current = id;
      const mine = ++seq;
      if (!id) { set(dpOut, {status: "idle", route: null, sounds: {}, error: null} as never); return; }
      set(dpOut, {status: "loading", route: null, sounds: {}, error: null} as never);
      try {
        const route = await call<RouteRow>(`${base}/${id}${q()}`, slug);
        if (stopped || mine !== seq) return;
        set(dpOut, {status: "ready", route, sounds: {}, error: null} as never);
        const sounds: Record<string, string> = {};
        for (const st of route.steps ?? []) {
          if (!st.hasSound) continue;
          try {
            const r = await call<{media?: string}>(`${base}/${id}/sounds/${Number(st.index)}${q()}`, slug);
            if (stopped || mine !== seq) return;
            if (typeof r?.media === "string" && r.media.startsWith("data:audio/")) {
              sounds[String(st.index)] = r.media;
              set(dpOut, {status: "ready", route, sounds: {...sounds}, error: null} as never);
            }
          } catch {
            /* un son manquant n'empêche pas le parcours */
          }
        }
      } catch (e) {
        if (mine === seq) set(dpOut, {status: "error", route: null, sounds: {}, error: message(e)} as never);
      }
    };
    listen(def.route, () => void load());
    void load();
  }

  return () => {
    stopped = true;
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
  let res: Response;
  try {
    res = await fetch(`${base}/public/artifacts/${encodeURIComponent(slug)}${path}`, {...init, headers});
  } catch (e) {
    // Réseau coupé, requête bloquée (CORS, extension) : message lisible, détail en console.
    console.warn(`[places] ${init.method ?? "GET"} ${path.split("?")[0]} :`, e);
    throw new Error("Serveur des balises injoignable : vérifie la connexion puis réessaie.");
  }
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

/**
 * Média d'un message : data: URL telle quelle ; URL blob: (dernier export de sonic-sketch, prise de
 * sonic-audio-recorder) ou {url} lue et convertie, pour être envoyée au serveur.
 */
async function asDataUrl(v: unknown): Promise<string | undefined> {
  const url = typeof v === "string" ? v : v && typeof v === "object" && typeof (v as {url?: unknown}).url === "string" ? (v as {url: string}).url : "";
  if (!url) return undefined;
  if (url.startsWith("data:")) return url;
  if (!url.startsWith("blob:")) throw new Error("média : data: ou blob: attendu");
  const blob = await (await fetch(url)).blob();
  if (blob.size > 650_000) throw new Error("média trop lourd (650 Ko au plus)");
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("média illisible"));
    r.readAsDataURL(blob);
  });
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
