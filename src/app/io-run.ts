import {dispatch, getStore} from "@supersoniks/creative-stack/interactive";
import {dp, get} from "@supersoniks/concorde/utils";
import {compileJsonata} from "@supersoniks/concorde/utils/jsonataRuntime";
import {loadApiBaseUrl, normalizeApiBase} from "./cloud/api-base";

/**
 * Contrat `io` du document (artefact utilisé comme outil) côté viewer.
 *
 *   "io": {
 *     "modes": ["interactive", "embed"],
 *     "input":  {"schema": {…}, "store": "calc", "action": "io:input"},
 *     "output": {"schema": {…}, "from": "calc.result", "when": "phase = 'done'"}
 *   }
 *
 * Deux sources d'entrée :
 * - un run serveur (`?run=<id>&rt=<jeton>` sur la page, ou `run` / `run-token` sur
 *   <artifact-embed>) : l'entrée est lue sur l'API, la sortie y est publiée et termine le run ;
 * - une entrée locale (`input` sur <artifact-embed>) : rien n'est envoyé au serveur.
 *
 * L'entrée part au store `input.store` en action `{type: input.action ?? "io:input", payload}`.
 * La sortie (`output.from`) est prise quand `output.when` (JSONata sur l'état du DataProvider lu)
 * devient vrai — sans `when`, au premier changement non vide après l'entrée — puis émise une seule
 * fois : événement DOM `artifact-output` {output, files, runId?} et, pour un run serveur, envoi des
 * fichiers (`io.output.files`) puis de la sortie.
 */
export type IoDef = {
  modes?: string[];
  input?: {store?: string; action?: string};
  output?: {from?: string; when?: string; files?: Record<string, string>};
};

export type IoStatus =
  | {state: "waiting"}
  | {state: "sending"}
  | {state: "done"}
  | {state: "closed"; message: string}
  | {state: "error"; message: string};

export type IoRunOptions = {
  slug: string;
  io: IoDef;
  /** Run serveur. */
  run?: {id: string; token: string} | null;
  /** Entrée locale (embed sans run serveur). */
  input?: unknown;
  /** Nom effectif d'un DataProvider / store (préfixe des artefacts intégrés). */
  resolve: (name: string) => string;
  onStatus: (s: IoStatus) => void;
  /** `files` : clé → URL (blob:, data:…) des fichiers de `io.output.files`. */
  onOutput: (output: unknown, runId: string | null, files: Record<string, string>) => void;
};

const STORE_WAIT_MS = 10_000;

/** Démarre le run ; renvoie la fonction d'arrêt. */
export function startIoRun(opts: IoRunOptions): () => void {
  let stopped = false;
  let off: (() => void) | null = null;
  const stop = () => {
    stopped = true;
    off?.();
  };

  void (async () => {
    let input: unknown = opts.input;
    if (opts.run) {
      try {
        const r = await fetchRun(opts.slug, opts.run.id, opts.run.token);
        if (r.status !== "pending") {
          opts.onStatus({
            state: "closed",
            message:
              r.status === "expired"
                ? "Cette tâche a expiré."
                : r.status === "cancelled"
                  ? "Cette tâche a été annulée."
                  : "Cette tâche est déjà terminée.",
          });
          return;
        }
        input = r.input;
      } catch (e) {
        opts.onStatus({state: "error", message: errorMessage(e)});
        return;
      }
    }
    if (stopped) return;

    const from = opts.io.output?.from;
    if (!from) return;
    const fromPath = mapPath(from, opts.resolve);
    const root = fromPath.split(".")[0];
    let when: ReturnType<typeof compileJsonata> | null = null;
    try {
      when = opts.io.output?.when?.trim() ? compileJsonata(opts.io.output.when) : null;
    } catch (e) {
      opts.onStatus({state: "error", message: `io.output.when : ${errorMessage(e)}`});
      return;
    }
    let armed = false;
    let sent = false;

    const check = async () => {
      if (!armed || sent || stopped) return;
      const output = get(fromPath) as unknown;
      if (when) {
        let ok = false;
        try {
          ok = (await when.evaluate(get(root) ?? {})) === true;
        } catch {
          ok = false;
        }
        if (!ok || sent || stopped) return;
      } else if (output === undefined || output === null) {
        return;
      }
      sent = true;
      off?.();
      const value = clone(output);
      const files = collectFiles(opts.io.output?.files, opts.resolve);
      if (!opts.run) {
        opts.onOutput(value, null, files);
        opts.onStatus({state: "done"});
        return;
      }
      opts.onStatus({state: "sending"});
      try {
        for (const [key, url] of Object.entries(files)) {
          await postRunFile(opts.slug, opts.run.id, opts.run.token, key, url);
        }
        await postRunOutput(opts.slug, opts.run.id, opts.run.token, value);
        opts.onOutput(value, opts.run.id, files);
        opts.onStatus({state: "done"});
      } catch (e) {
        // Sortie refusée (non conforme) : on réarme pour laisser la personne corriger.
        sent = false;
        opts.onStatus({state: "error", message: errorMessage(e)});
      }
    };

    try {
      const provider = dp(root) as {
        onAssign?: (cb: (v: unknown) => void) => void;
        offAssign?: (cb: (v: unknown) => void) => void;
      };
      const cb = () => queueMicrotask(() => void check());
      provider.onAssign?.(cb);
      off = () => provider.offAssign?.(cb);
    } catch {
      /* ignore */
    }

    const storeId = opts.io.input?.store ? opts.resolve(opts.io.input.store) : null;
    if (storeId && !(await waitForStore(storeId, () => stopped))) {
      if (!stopped) opts.onStatus({state: "error", message: `Store « ${opts.io.input?.store} » introuvable.`});
      return;
    }
    if (stopped) return;
    opts.onStatus({state: "waiting"});
    armed = true;
    // Sans run ni entrée (embed, aperçu de l'atelier) : la sortie est seulement émise quand `when` devient vraie.
    if (storeId && (opts.run || input !== undefined)) {
      dispatch(storeId, {type: opts.io.input?.action || "io:input", payload: clone(input ?? {})});
    }
    queueMicrotask(() => void check());
  })();

  return stop;
}

/** URL des fichiers de sortie : chaîne (`blob:`, `data:`, https) ou objet `{url | href | src}`. */
function collectFiles(files: Record<string, string> | undefined, resolve: (n: string) => string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, path] of Object.entries(files ?? {})) {
    if (typeof path !== "string") continue;
    const v = get(mapPath(path, resolve)) as unknown;
    const o = v && typeof v === "object" ? (v as {url?: unknown; href?: unknown; src?: unknown}) : null;
    const url = typeof v === "string" ? v : o ? (o.url ?? o.href ?? o.src) : null;
    if (typeof url === "string" && /^(blob:|data:|https:)/.test(url)) out[key] = url;
  }
  return out;
}

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/flac": "flac",
  "audio/webm": "webm",
  "video/webm": "webm",
  "video/mp4": "mp4",
  "model/gltf-binary": "glb",
  "application/json": "json",
};

/** Envoie un fichier de sortie (`<clé>.<ext>`, extension d'après son type). */
async function postRunFile(slug: string, runId: string, token: string, key: string, url: string): Promise<void> {
  const blob = await (await fetch(url)).blob();
  const type = (blob.type || "").split(";")[0].trim().toLowerCase();
  const ext = EXT[type];
  if (!ext) throw new Error(`Fichier « ${key} » : type ${type || "inconnu"} non accepté.`);
  const res = await fetch(`${runUrl(slug, runId)}/files/${encodeURIComponent(`${key}.${ext}`)}?rt=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: {Accept: "application/json", "Content-Type": type},
    body: blob,
  });
  if (!res.ok) throw new Error(await failure(res, `Envoi du fichier « ${key} » refusé.`));
}

/** `store.chemin` → nom effectif du DataProvider + chemin inchangé. */
function mapPath(path: string, resolve: (n: string) => string): string {
  const dot = path.indexOf(".");
  return dot < 0 ? resolve(path) : resolve(path.slice(0, dot)) + path.slice(dot);
}

async function waitForStore(id: string, cancelled: () => boolean): Promise<boolean> {
  const start = Date.now();
  while (!getStore(id)) {
    if (cancelled() || Date.now() - start > STORE_WAIT_MS) return false;
    await new Promise((r) => setTimeout(r, 50));
  }
  return true;
}

function clone<T>(v: T): T {
  try {
    return JSON.parse(JSON.stringify(v)) as T;
  } catch {
    return v;
  }
}

/** Run (paramètres de la page) : `?run=<uuid>&rt=<jeton>`. */
export function runFromLocation(search: string): {id: string; token: string} | null {
  const q = new URLSearchParams(search);
  const id = q.get("run") ?? "";
  const token = q.get("rt") ?? "";
  return /^[0-9a-fA-F-]{36}$/.test(id) && token ? {id, token} : null;
}

type PublicRun = {runId: string; status: string; input?: unknown};

function runUrl(slug: string, runId: string): string {
  return `${normalizeApiBase(loadApiBaseUrl())}/api/public/artifacts/${encodeURIComponent(slug)}/runs/${encodeURIComponent(runId)}`;
}

async function fetchRun(slug: string, runId: string, token: string): Promise<PublicRun> {
  const res = await fetch(`${runUrl(slug, runId)}?rt=${encodeURIComponent(token)}`, {
    headers: {Accept: "application/json"},
  });
  if (!res.ok) throw new Error(await failure(res, "Tâche introuvable (lien invalide ?)."));
  return (await res.json()) as PublicRun;
}

async function postRunOutput(slug: string, runId: string, token: string, output: unknown): Promise<void> {
  const res = await fetch(`${runUrl(slug, runId)}/output`, {
    method: "POST",
    headers: {Accept: "application/json", "Content-Type": "application/json"},
    body: JSON.stringify({rt: token, output: output === undefined ? null : output}),
  });
  if (!res.ok) throw new Error(await failure(res, "Envoi du résultat refusé."));
}

async function failure(res: Response, fallback: string): Promise<string> {
  try {
    const j = (await res.json()) as {detail?: string; error?: string; message?: string; title?: string};
    return j.detail || j.error || j.message || j.title || fallback;
  } catch {
    return fallback;
  }
}

function errorMessage(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 300);
}
