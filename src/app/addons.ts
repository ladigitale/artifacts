/**
 * Addons creative-stack chargés à la demande.
 *
 * Seul `interactive` (store, actions, ticker… et compléments de sonic-if / sonic-value)
 * fait partie du socle. Les autres (3d/three, shader, webgpu, audio, média, physique,
 * hugging-face…) ne sont chargés que si le document utilise un de leurs composants,
 * une seule fois par page : la promesse est mise en cache et le navigateur n'évalue un
 * module qu'une fois, même avec plusieurs artefacts intégrés.
 *
 * Le registre tag → addon vient des `manifest.json` de la creative-stack : rien à tenir
 * à jour ici quand un addon gagne un composant.
 */
import "@supersoniks/creative-stack/interactive";

type Manifest = {id: string; components?: {name: string}[]};

const manifests = import.meta.glob<Manifest>(
  "/node_modules/@supersoniks/creative-stack/src/addons/*/manifest.json",
  {eager: true, import: "default"},
);
const loaders = import.meta.glob("/node_modules/@supersoniks/creative-stack/src/addons/*/index.ts");

/** Addons du socle : importés statiquement, jamais à la demande. */
const CORE = new Set(["interactive"]);

const addonByTag = new Map<string, () => Promise<unknown>>();
for (const [path, manifest] of Object.entries(manifests)) {
  if (!manifest?.id || CORE.has(manifest.id)) continue;
  const load = loaders[path.replace(/manifest\.json$/, "index.ts")];
  if (!load) continue;
  for (const c of manifest.components ?? []) {
    if (c?.name) addonByTag.set(c.name.toLowerCase(), load);
  }
}

/** Composant d'un addon chargé à la demande (défini ou pas encore). */
export function isAddonTag(tag: string): boolean {
  return addonByTag.has(tag.toLowerCase());
}

const loading = new Map<() => Promise<unknown>, Promise<unknown>>();

function loadOnce(load: () => Promise<unknown>): Promise<unknown> {
  let p = loading.get(load);
  if (!p) {
    p = load().catch((e) => {
      loading.delete(load); // nouvel essai au prochain artefact (réseau coupé…)
      throw e;
    });
    loading.set(load, p);
  }
  return p;
}

function collectTags(value: unknown, out: Set<string>, depth = 0): void {
  if (depth > 64 || !value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const v of value) collectTags(v, out, depth + 1);
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === "tagName" && typeof v === "string") out.add(v.toLowerCase());
    else collectTags(v, out, depth + 1);
  }
}

/** Charge les addons nécessaires au document (et seulement ceux-là). */
export async function ensureAddonsFor(doc: unknown): Promise<void> {
  const tags = new Set<string>();
  collectTags(doc, tags);
  const needed = new Set<() => Promise<unknown>>();
  for (const tag of tags) {
    const load = addonByTag.get(tag);
    if (load) needed.add(load);
  }
  await Promise.all([...needed].map(loadOnce));
}
