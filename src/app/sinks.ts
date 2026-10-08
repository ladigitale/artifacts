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
 *       "from": "game.outbox",          // tableau de {id, data}
 *       "merge": {"name": "eleve.name"}, // champs ajoutés depuis d'autres DP
 *       "code": "eleve.code",           // code de session (si requireCode)
 *       "ack": "game"                   // store qui reçoit sink:ok / sink:error
 *     }
 *   }
 */
export type SinkDef = {
  collection: string;
  from: string;
  merge?: Record<string, string>;
  code?: string;
  ack?: string;
};

type OutboxItem = {id?: unknown; data?: unknown};

const MAX_SENT_IDS = 500;

export function startSinks(
  slug: string,
  linkToken: string | null,
  sinks: Record<string, SinkDef> | undefined,
): () => void {
  const offs: Array<() => void> = [];
  for (const [name, sink] of Object.entries(sinks ?? {})) {
    if (!sink?.collection || !sink.from) continue;
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
        void send(slug, sink, data, code == null || code === "" ? null : String(code), linkToken).then(
          () => ack(sink, {type: "sink:ok", payload: {id, sink: name}}),
          (e: unknown) =>
            ack(sink, {type: "sink:error", payload: {id, sink: name, error: errorMessage(e)}}),
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
  return () => offs.forEach((off) => off());
}

function ack(sink: SinkDef, action: {type: string; payload: unknown}) {
  if (sink.ack) dispatch(sink.ack, action);
}

const MAX_ATTEMPTS = 6;

/**
 * Poste un élément ; en cas de limitation (429) ou de coupure réseau, réessaie avec
 * un délai croissant et aléatoire : toute une classe derrière la même IP finit au même moment.
 */
async function send(
  slug: string,
  sink: SinkDef,
  data: Record<string, unknown>,
  code: string | null,
  linkToken: string | null,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await postIntakeRecord(slug, sink.collection, data, code, linkToken);
      return;
    } catch (e) {
      const retriable = !(e instanceof IntakeError) || e.status === 429 || e.status >= 500;
      if (!retriable || attempt >= MAX_ATTEMPTS) throw e;
      const base = e instanceof IntakeError && e.retryAfter ? e.retryAfter * 1000 : 1500 * 2 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, Math.min(30_000, base) + Math.random() * 2000));
    }
  }
}

function errorMessage(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 200);
}
