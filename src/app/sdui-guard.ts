const FORBIDDEN_NODE = new Set(["markup", "innerHTML", "prefix", "suffix", "js", "css"]);

const MAX_ATTR: Record<string, number> = {
  reducer: 32 * 1024,
  initial: 32 * 1024,
  keymap: 8 * 1024,
  palette: 4 * 1024,
  image: 32 * 1024,
  shader: 32 * 1024,
  bank: 64 * 1024,
  pattern: 16 * 1024,
  samples: 16 * 1024,
  params: 4 * 1024,
};

const MAX_STORES = 8;
const MAX_TICKERS = 8;
const MAX_SOUNDS = 2;
/** Instruments et horloges audio par document. */
const MAX_AUDIO: Record<string, number> = {
  "sonic-patch": 16,
  "sonic-sampler": 8,
  "sonic-sequencer": 4,
  "sonic-audio-analyser": 4,
  "sonic-mic": 2,
  "sonic-camera": 2,
  "sonic-video": 6,
};

/** Accès sensibles : le composant n'est accepté que si le document les déclare dans `capabilities`. */
export const CAPABILITY_TAGS: Record<string, "camera" | "microphone"> = {
  "sonic-camera": "camera",
  "sonic-mic": "microphone",
};

export const KNOWN_CAPABILITIES = ["camera", "microphone"] as const;

/** Capacités déclarées par le document (inconnues ignorées). */
export function docCapabilities(doc: unknown): string[] {
  const caps = (doc as {capabilities?: unknown} | null)?.capabilities;
  if (!Array.isArray(caps)) return [];
  return caps.filter((c): c is string => typeof c === "string" && (KNOWN_CAPABILITIES as readonly string[]).includes(c));
}

export type GuardError = {path: string; message: string};

export function guardDocument(doc: unknown): GuardError[] {
  const errors: GuardError[] = [];
  if (!doc || typeof doc !== "object") {
    return [{path: "", message: "Document invalide."}];
  }
  const d = doc as Record<string, unknown>;
  if (d.schema !== "artifacts/1") {
    errors.push({path: "/schema", message: 'schema doit être "artifacts/1".'});
  }
  const views = d.views;
  if (!Array.isArray(views)) {
    errors.push({path: "/views", message: "views requis."});
    return errors;
  }

  let storeCount = 0;
  let tickerCount = 0;
  let soundCount = 0;
  const audioCount: Record<string, number> = {};
  const declared = new Set(docCapabilities(d));
  if (d.capabilities !== undefined && !Array.isArray(d.capabilities)) {
    errors.push({path: "/capabilities", message: 'capabilities : tableau attendu (ex. ["camera"]).'});
  }

  const data = d.data as {stores?: Record<string, unknown>} | undefined;
  if (data?.stores && typeof data.stores === "object") {
    storeCount += Object.keys(data.stores).length;
    for (const [id, def] of Object.entries(data.stores)) {
      if (!def || typeof def !== "object") continue;
      const reducer = String((def as {reducer?: unknown}).reducer ?? "");
      if (reducer.length > MAX_ATTR.reducer) {
        errors.push({
          path: `/data/stores/${id}/reducer`,
          message: "reducer trop long.",
        });
      }
    }
  }

  const walk = (node: unknown, path: string) => {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    for (const k of FORBIDDEN_NODE) {
      if (k in n) errors.push({path: `${path}/${k}`, message: `"${k}" interdit.`});
    }
    const tag = String(n.tagName ?? "div").toLowerCase();
    if (tag === "script" || tag.includes("script")) {
      errors.push({path: `${path}/tagName`, message: "script interdit."});
    }
    if (tag === "sonic-store") storeCount += 1;
    if (tag === "sonic-ticker") tickerCount += 1;
    if (tag === "sonic-sound") soundCount += 1;
    if (tag in MAX_AUDIO) audioCount[tag] = (audioCount[tag] ?? 0) + 1;
    const cap = CAPABILITY_TAGS[tag];
    if (cap && !declared.has(cap)) {
      errors.push({path: `${path}/tagName`, message: `${tag} : déclarer "${cap}" dans capabilities.`});
    }
    const attrs = n.attributes;
    if (attrs && typeof attrs === "object") {
      for (const [attr, val] of Object.entries(attrs as Record<string, unknown>)) {
        if (/^on/i.test(attr) && typeof val === "string") {
          errors.push({path: `${path}/attributes/${attr}`, message: "handler interdit."});
        }
        if (typeof val === "string" && /^\s*javascript:/i.test(val)) {
          errors.push({
            path: `${path}/attributes/${attr}`,
            message: "URL javascript interdite.",
          });
        }
        const max = MAX_ATTR[attr.toLowerCase()];
        if (max && typeof val === "string" && val.length > max) {
          errors.push({
            path: `${path}/attributes/${attr}`,
            message: `attribut trop long (max ${max}).`,
          });
        }
      }
    }
    if (Array.isArray(n.nodes)) n.nodes.forEach((c, i) => walk(c, `${path}/nodes/${i}`));
  };
  views.forEach((v, i) => {
    if (v && typeof v === "object" && (v as {root?: unknown}).root) {
      walk((v as {root: unknown}).root, `/views/${i}/root`);
    }
  });

  if (storeCount > MAX_STORES) {
    errors.push({path: "/views", message: `Trop de sonic-store (max ${MAX_STORES}).`});
  }
  if (tickerCount > MAX_TICKERS) {
    errors.push({path: "/views", message: `Trop de sonic-ticker (max ${MAX_TICKERS}).`});
  }
  if (soundCount > MAX_SOUNDS) {
    errors.push({path: "/views", message: `Trop de sonic-sound (max ${MAX_SOUNDS}).`});
  }
  for (const [tag, max] of Object.entries(MAX_AUDIO)) {
    if ((audioCount[tag] ?? 0) > max) {
      errors.push({path: "/views", message: `Trop de ${tag} (max ${max}).`});
    }
  }
  return errors;
}
