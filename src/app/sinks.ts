import {dispatch} from "@supersoniks/creative-stack/interactive";
import {dp, get} from "@supersoniks/concorde/utils";
import {IntakeError, postIntakeRecord} from "./cloud/client";

/**
 * `data.sinks` : envoi contrôlé d'éléments d'une file (outbox) d'un store vers une
 * collection déclarée avec `intake` côté API. Le document ne fait aucune requête :
 * le viewer lit la file, poste chaque élément une seule fois, puis notifie le store
 * (`sink:ok` / `sink:error`) qui retire l'élément de sa file.
 *
 *   "sinks": {
 *     "scores": {
 *       "collection": "scores",
 *       "channels": ["scores2", "scores3"], // collections en plus, envoyées en parallèle
 *       "from": "game.outbox",          // tableau de {id, data}
 *       "merge": {"name": "eleve.name"}, // champs ajoutés depuis d'autres DP
 *       "code": "eleve.code",           // code de session (si requireCode)
 *       "ack": "game"                   // store qui reçoit sink:ok / sink:error
 *     }
 *   }
 *
 * Chaque collection (canal) a sa file : un envoi à la fois, espacé de son `intake.minInterval`
 * (lu dans `data.sources`), au lieu d'une rafale que l'API refuse en 429 puis fait attendre.
 * Avec `channels`, chaque élément part sur le canal libre le plus tôt : N canaux = N envois par
 * intervalle. L'ordre d'arrivée entre canaux n'est pas garanti (trier les lectures par un champ
 * `ts`) ; une source relit tous les canaux avec la même clé `channels`.
 */
export type SinkDef = {
  collection: string;
  channels?: string[];
  from: string;
  merge?: Record<string, string>;
  code?: string;
  ack?: string;
};

export type SinkOptions = {
  /** `intake.minInterval` (secondes) par collection, tiré de `data.sources`. */
  minInterval?: Record<string, number>;
  /** Appelé après chaque envoi réussi (relecture des sources de cette collection). */
  onSent?: (collection: string) => void;
};

type OutboxItem = {id?: unknown; data?: unknown};

const MAX_SENT_IDS = 500;
/** Marge ajoutée à `minInterval` : horloges et trajets réseau différents. */
const PACE_MARGIN_MS = 150;
const MAX_CHANNELS = 8;

/** Une file d'envoi par collection, partagée par tous les sinks qui la visent. */
type Channel = {collection: string; gapMs: number; nextAt: number; tail: Promise<void>; pending: number};

export function startSinks(
  slug: string,
  linkToken: string | null,
  sinks: Record<string, SinkDef> | undefined,
  options: SinkOptions = {},
): () => void {
  const offs: Array<() => void> = [];
  let stopped = false;
  const channels = new Map<string, Channel>();
  const channel = (collection: string): Channel => {
    let c = channels.get(collection);
    if (!c) {
      const min = Number(options.minInterval?.[collection]);
      const gapMs = Number.isFinite(min) && min > 0 ? min * 1000 + PACE_MARGIN_MS : 0;
      c = {collection, gapMs, nextAt: 0, tail: Promise.resolve(), pending: 0};
      channels.set(collection, c);
    }
    return c;
  };

  /** Canal où l'élément partira le plus tôt (file la plus courte à cadence égale). */
  const pick = (list: Channel[]): Channel => {
    const now = Date.now();
    let best = list[0];
    let bestAt = Infinity;
    for (const c of list) {
      const at = Math.max(now, c.nextAt) + c.pending * Math.max(c.gapMs, 1);
      if (at < bestAt) {
        best = c;
        bestAt = at;
      }
    }
    return best;
  };

  const enqueue = (c: Channel, job: () => Promise<void>) => {
    c.pending++;
    c.tail = c.tail.then(async () => {
      const wait = c.nextAt - Date.now();
      if (wait > 0) await sleep(wait);
      try {
        if (!stopped) await job();
      } finally {
        c.pending--;
        c.nextAt = Date.now() + c.gapMs;
      }
    });
  };

  for (const [name, sink] of Object.entries(sinks ?? {})) {
    if (!sink?.collection || !sink.from) continue;
    const names = [sink.collection, ...(Array.isArray(sink.channels) ? sink.channels : [])]
      .filter((n): n is string => typeof n === "string" && n !== "")
      .filter((n, i, all) => all.indexOf(n) === i)
      .slice(0, MAX_CHANNELS);
    const lanes = names.map(channel);
    const sent = new Set<string>();
    const root = sink.from.split(".")[0];

    const flush = () => {
      const outbox = get(sink.from) as unknown;
      if (!Array.isArray(outbox)) return;
      for (const raw of outbox as OutboxItem[]) {
        if (!raw || typeof raw !== "object") continue;
        const id = typeof raw.id === "string" || typeof raw.id === "number" ? String(raw.id) : "";
        if (!id || sent.has(id)) continue;
        if (sent.size >= MAX_SENT_IDS) return;
        sent.add(id);
        const data: Record<string, unknown> =
          raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)
            ? {...(raw.data as Record<string, unknown>)}
            : {};
        for (const [field, path] of Object.entries(sink.merge ?? {})) {
          const v = get(path) as unknown;
          if (v !== undefined && v !== null && typeof v !== "object") data[field] = v;
        }
        const code = sink.code ? get(sink.code) : undefined;
        const lane = pick(lanes);
        enqueue(lane, () =>
          send(slug, lane, data, code == null || code === "" ? null : String(code), linkToken).then(
            () => {
              ack(sink, {type: "sink:ok", payload: {id, sink: name, channel: lane.collection}});
              options.onSent?.(lane.collection);
            },
            (e: unknown) =>
              ack(sink, {type: "sink:error", payload: {id, sink: name, channel: lane.collection, error: errorMessage(e)}}),
          ),
        );
      }
    };

    try {
      const provider = dp(root) as {
        onAssign?: (cb: (v: unknown) => void) => void;
        offAssign?: (cb: (v: unknown) => void) => void;
      };
      const cb = () => queueMicrotask(flush);
      provider.onAssign?.(cb);
      offs.push(() => provider.offAssign?.(cb));
    } catch {
      /* ignore */
    }
    flush();
  }
  return () => {
    stopped = true;
    offs.forEach((off) => off());
  };
}

function ack(sink: SinkDef, action: {type: string; payload: unknown}) {
  if (sink.ack) dispatch(sink.ack, action);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const MAX_ATTEMPTS = 6;

/**
 * Poste un élément ; en cas de limitation (429) ou de coupure réseau, réessaie avec
 * un délai croissant et aléatoire : toute une classe derrière la même IP finit au même moment.
 * Le canal reste occupé pendant l'attente : les éléments suivants ne relancent pas de 429.
 */
async function send(
  slug: string,
  lane: Channel,
  data: Record<string, unknown>,
  code: string | null,
  linkToken: string | null,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await postIntakeRecord(slug, lane.collection, data, code, linkToken);
      return;
    } catch (e) {
      const retriable = !(e instanceof IntakeError) || e.status === 429 || e.status >= 500;
      if (!retriable || attempt >= MAX_ATTEMPTS) throw e;
      // 429 : l'API dit combien attendre ; sinon le pas du canal, puis un délai croissant.
      const base =
        e instanceof IntakeError && e.retryAfter
          ? e.retryAfter * 1000
          : Math.max(lane.gapMs, 1000 * 2 ** (attempt - 1));
      await sleep(Math.min(30_000, base) + Math.random() * 1000);
    }
  }
}

function errorMessage(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 200);
}
