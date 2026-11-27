import {fetchCollectionLive} from "./cloud/client";

/**
 * Collections en direct : le viewer s'abonne au topic Mercure d'une collection (Tadaaa publie
 * chaque record créé, modifié ou retiré) et applique ces changements sans relire la collection.
 *
 * Message : {collection, upsert?: [{id, data, createdAt, updatedAt}], remove?: [id], reset?: true}.
 * `onResync` demande une relecture complète : reconnexion après une coupure (messages manqués),
 * `reset` (collection vidée). Sans hub (ou API plus ancienne) : `start` rend `null`, la source
 * garde sa relecture périodique.
 */
export type LiveRow = {id: string; data?: unknown; createdAt?: string; updatedAt?: string};
export type LiveMessage = {collection?: string; upsert?: LiveRow[]; remove?: string[]; reset?: boolean};

export type LiveHandlers = {
  onMessage: (msg: LiveMessage) => void;
  onResync: () => void;
};

const RENEW_EARLY_S = 60;
const RETRY_MS = 15_000;

export async function startCollectionLive(
  slug: string,
  collection: string,
  linkToken: string | null,
  readKey: string | null,
  handlers: LiveHandlers,
): Promise<(() => void) | null> {
  if (typeof EventSource === "undefined") return null;
  const first = await fetchCollectionLive(slug, collection, linkToken, readKey);
  if (!first) return null;

  let stopped = false;
  let source: EventSource | null = null;
  let renewTimer = 0;
  let broken = false;

  const connect = (creds: {hubUrl: string; token: string; topic: string; expiresIn: number}, resync: boolean) => {
    source?.close();
    const url = new URL(creds.hubUrl);
    url.searchParams.append("topic", creds.topic);
    url.searchParams.set("authorization", creds.token);
    const es = new EventSource(url.toString());
    const onData = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(String(e.data)) as LiveMessage;
        if (msg.reset) handlers.onResync();
        else handlers.onMessage(msg);
      } catch {
        /* message illisible : ignoré */
      }
    };
    es.addEventListener("records", onData as EventListener);
    es.onmessage = onData;
    es.onopen = () => {
      // Changements publiés pendant une coupure ou un renouvellement : relecture complète.
      if (broken || resync) handlers.onResync();
      broken = false;
      resync = false;
    };
    es.onerror = () => {
      broken = true;
    };
    source = es;
    clearTimeout(renewTimer);
    const ttl = Math.max(RENEW_EARLY_S, (creds.expiresIn || 3600) - RENEW_EARLY_S) * 1000;
    renewTimer = window.setTimeout(() => void renew(), ttl);
  };

  const renew = async () => {
    if (stopped) return;
    const next = await fetchCollectionLive(slug, collection, linkToken, readKey);
    if (stopped) return;
    if (next) connect(next, true);
    else renewTimer = window.setTimeout(() => void renew(), RETRY_MS);
  };

  connect(first, false);
  return () => {
    stopped = true;
    clearTimeout(renewTimer);
    source?.close();
    source = null;
  };
}

/** Applique un message à une liste de records (du plus récent au plus ancien, comme l'API). */
export function applyLive(rows: LiveRow[], msg: LiveMessage): LiveRow[] {
  const removed = new Set((msg.remove ?? []).filter((id) => typeof id === "string"));
  let out = removed.size ? rows.filter((r) => !removed.has(r.id)) : rows.slice();
  for (const row of msg.upsert ?? []) {
    if (!row || typeof row.id !== "string") continue;
    const i = out.findIndex((r) => r.id === row.id);
    if (i >= 0) out[i] = row;
    else out = [row, ...out];
  }
  return out;
}

/** Même tri que l'API (`ArtifactIntakeSchema::sortAndLimit`) : 3 clés au plus, `-` = décroissant. */
export function sortAndLimit(rows: LiveRow[], sort?: string, limit?: number): LiveRow[] {
  const keys = String(sort ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((k) => ({desc: k.startsWith("-"), name: k.replace(/^[-+]+/, "")}))
    .filter((k) => /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(k.name));
  let out = rows;
  if (keys.length) {
    const value = (r: LiveRow, f: string): unknown =>
      f === "createdAt" || f === "updatedAt"
        ? (r as Record<string, unknown>)[f] ?? null
        : ((r.data as Record<string, unknown> | undefined)?.[f] ?? null);
    const numeric = (v: unknown) => (typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))));
    out = rows.slice().sort((x, y) => {
      for (const {name, desc} of keys) {
        const a = value(x, name);
        const b = value(y, name);
        if (a === null || b === null) {
          if (a === b) continue;
          return a === null ? 1 : -1;
        }
        const c = numeric(a) && numeric(b) ? Math.sign(Number(a) - Number(b)) : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
        if (c !== 0) return desc ? -c : c;
      }
      return 0;
    });
  }
  return limit && limit > 0 ? out.slice(0, limit) : out;
}
