/**
 * Configuration de `sonic-hugging-face-infer` pour le viewer.
 *
 * Sans `configureHuggingFace()` le composant reste inactif. Son attribut `model` est une clé
 * de la liste de modèles configurée. Le viewer la construit à partir de deux sources :
 *
 *  1. des raccourcis curés (`HF_SHORTCUTS`) : alias courts, révision et options figées ;
 *  2. tout identifiant `org/nom` (ou URL `https://huggingface.co/org/nom`) rencontré dans le
 *     document : résolu via l'API du Hub AVANT le rendu (tâche = `pipeline_tag`, révision =
 *     sha courant, dtype = variante ONNX la plus légère, taille = poids réel des fichiers).
 *
 * Garde-fous maintenus pour les identifiants libres : modèle public, non « gated », avec des
 * poids ONNX (Transformers.js), tâche supportée par le composant (pas de génération libre de
 * texte), taille bornée, consentement avant tout téléchargement lourd. Les modèles sont
 * toujours téléchargés depuis le Hub dans le navigateur de l'utilisateur ; rien n'est copié
 * dans ce dépôt.
 *
 * Appelé à la demande par `addons.ts` : rien n'est chargé pour les artefacts sans le composant.
 */
import {
  configureHuggingFace,
  defineHuggingFaceModels,
} from "@supersoniks/creative-stack/hugging-face-infer";

/** Moteur : Transformers.js, version exacte (jamais un tag), servi par jsDelivr (CSP : script-src/worker-src). */
const TRANSFORMERS_VERSION = "4.3.0";
/** onnxruntime-web attendu par Transformers.js 4.3.0 (voir sa package.json). */
const ORT_VERSION = "1.31.0-dev.20260914-8d85527a0";

const HUB = "https://huggingface.co";
const ID_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
/** Au-delà, un modèle d'artefact est refusé (poids des fichiers ONNX retenus). */
const MAX_MODEL_MB = 600;

/** Raccourcis : alias court → modèle figé (révision épinglée). Facultatifs, `org/nom` marche aussi. */
export const HF_SHORTCUTS = defineHuggingFaceModels({
  "depth-small": {
    task: "depth-estimation",
    repo: "Xenova/depth-anything-small-hf",
    revision: "2e942621ab9f2371c1df9eb223291b5ac31475e6",
    options: {dtype: "q8"},
    sizeBytes: 27_000_000,
    label: "Profondeur d'image",
    description: "Estime la profondeur d'une photo, localement dans ton navigateur.",
  },
  "zero-shot": {
    task: "zero-shot-classification",
    repo: "Xenova/mobilebert-uncased-mnli",
    revision: "8b0ea66ab7b190bba77418ba03b67d69cfc9a1ee",
    options: {dtype: "q8"},
    sizeBytes: 25_000_000,
    label: "Classement de texte",
    description: "Classe un texte (anglais) parmi les étiquettes proposées, localement.",
  },
});

/**
 * `pipeline_tag` du Hub → tâche du composant. Les tâches absentes (text-generation,
 * text-to-image…) ne sont pas supportées : pas de génération libre dans un artefact.
 */
const TASK_BY_PIPELINE: Record<string, string> = {
  "feature-extraction": "feature-extraction",
  "sentence-similarity": "feature-extraction",
  "text-classification": "text-classification",
  "zero-shot-classification": "zero-shot-classification",
  translation: "translation",
  "token-classification": "token-classification",
  "fill-mask": "fill-mask",
  "question-answering": "question-answering",
  "image-classification": "image-classification",
  "zero-shot-image-classification": "zero-shot-image-classification",
  "object-detection": "object-detection",
  "zero-shot-object-detection": "zero-shot-object-detection",
  "image-feature-extraction": "image-feature-extraction",
  "image-segmentation": "image-segmentation",
  "depth-estimation": "depth-estimation",
  "image-to-text": "image-to-text",
  "audio-classification": "audio-classification",
  "automatic-speech-recognition": "automatic-speech-recognition",
};

/** Variantes ONNX par ordre de préférence (la plus légère d'abord, adaptée au CPU). */
const DTYPES: readonly [dtype: string, suffix: string][] = [
  ["q8", "_quantized"],
  ["int8", "_int8"],
  ["uint8", "_uint8"],
  ["q4", "_q4"],
  ["fp16", "_fp16"],
  ["fp32", ""],
];
const KNOWN_SUFFIX = /_(quantized|int8|uint8|q4f16|q4|bnb4|fp16)$/;

type HubFile = {rfilename: string; size?: number};
type HubInfo = {
  sha?: string;
  pipeline_tag?: string;
  private?: boolean;
  gated?: boolean | string;
  disabled?: boolean;
  siblings?: HubFile[];
  cardData?: {license?: string};
};

type ModelDef = {
  task: string;
  repo: string;
  revision: string;
  options?: Record<string, unknown>;
  devices?: readonly ("webgpu" | "wasm")[];
  sizeBytes?: number;
  license?: string;
  label?: string;
  description?: string;
};

/** `org/nom` ou URL du Hub → `org/nom` (null si le format n'est pas reconnu). */
export function hubIdOf(value: string): string | null {
  const v = value.trim();
  if (ID_RE.test(v)) return v;
  const m = /^https:\/\/(?:www\.)?huggingface\.co\/([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)\/?$/i.exec(v);
  return m ? m[1] : null;
}

/** Définition d'un modèle du Hub, ou la raison du refus. */
async function resolveFromHub(id: string): Promise<{def: ModelDef} | {error: string}> {
  let info: HubInfo;
  try {
    const res = await fetch(`${HUB}/api/models/${id}?blobs=true`);
    if (!res.ok) return {error: res.status === 404 ? "introuvable ou privé" : `Hub HTTP ${res.status}`};
    info = (await res.json()) as HubInfo;
  } catch (e) {
    return {error: `Hub injoignable (${e instanceof Error ? e.message : String(e)})`};
  }
  if (info.private || info.disabled) return {error: "modèle privé ou désactivé"};
  if (info.gated) return {error: "modèle « gated » (accès sur demande) : non supporté"};
  if (!info.sha) return {error: "révision introuvable"};
  const task = TASK_BY_PIPELINE[info.pipeline_tag ?? ""];
  if (!task) {
    return {
      error: `tâche « ${info.pipeline_tag ?? "inconnue"} » non supportée (tâches : ${[...new Set(Object.values(TASK_BY_PIPELINE))].join(", ")})`,
    };
  }
  const onnx = (info.siblings ?? []).filter((f) => /^onnx\/.+\.onnx$/.test(f.rfilename));
  if (!onnx.length) return {error: "pas de poids ONNX (format requis par Transformers.js)"};

  for (const [dtype, suffix] of DTYPES) {
    const files = onnx.filter((f) => {
      const stem = f.rfilename.replace(/^onnx\//, "").replace(/\.onnx$/, "");
      return suffix ? stem.endsWith(suffix) : !KNOWN_SUFFIX.test(stem);
    });
    if (!files.length) continue;
    const stems = new Set(files.map((f) => f.rfilename));
    // Poids externes (`.onnx_data`) des fichiers retenus.
    const sizeBytes = (info.siblings ?? [])
      .filter((f) => stems.has(f.rfilename) || [...stems].some((s) => f.rfilename.startsWith(`${s}_data`)))
      .reduce((sum, f) => sum + (f.size ?? 0), 0);
    if (sizeBytes > MAX_MODEL_MB * 1_000_000) {
      return {error: `${Math.round(sizeBytes / 1e6)} Mo > ${MAX_MODEL_MB} Mo`};
    }
    return {
      def: {
        task,
        repo: id,
        revision: info.sha,
        options: {dtype},
        sizeBytes: sizeBytes || undefined,
        license: info.cardData?.license,
        label: id,
      },
    };
  }
  return {error: "aucune variante ONNX exploitable"};
}

/* ------------------------------------------------------------------ */
/* Document → modèles                                                  */
/* ------------------------------------------------------------------ */

function collectModels(value: unknown, out: Set<string>, depth = 0): void {
  if (depth > 64 || !value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const v of value) collectModels(v, out, depth + 1);
    return;
  }
  const node = value as Record<string, unknown>;
  if (typeof node.tagName === "string" && node.tagName.toLowerCase() === "sonic-hugging-face-infer") {
    const model = (node.attributes as Record<string, unknown> | undefined)?.model;
    if (typeof model === "string") out.add(model);
  }
  for (const v of Object.values(node)) collectModels(v, out, depth + 1);
}

const resolved = new Map<string, ModelDef | null>();
let applied = new Set<string>();
let started = false;

/**
 * Configure l'inférence pour ce document : raccourcis + modèles `org/nom` qu'il utilise.
 * À attendre AVANT le rendu (reconfigurer redémarre les composants déjà connectés).
 */
export async function configureViewerHuggingFace(doc: unknown): Promise<void> {
  const wanted = new Set<string>();
  collectModels(doc, wanted);

  await Promise.all(
    [...wanted].map(async (value) => {
      if (Object.prototype.hasOwnProperty.call(HF_SHORTCUTS, value) || resolved.has(value)) return;
      const id = hubIdOf(value);
      if (!id) {
        console.warn(`[artifacts] modèle HF « ${value} » : utiliser org/nom, l'URL du modèle ou un raccourci (${Object.keys(HF_SHORTCUTS).join(", ")}).`);
        resolved.set(value, null);
        return;
      }
      const r = await resolveFromHub(id);
      if ("error" in r) console.warn(`[artifacts] modèle HF « ${id} » refusé : ${r.error}.`);
      resolved.set(value, "def" in r ? r.def : null);
    }),
  );

  const models: Record<string, ModelDef> = {...HF_SHORTCUTS};
  const keys = new Set<string>();
  for (const [value, def] of resolved) {
    if (def) {
      models[value] = def;
      keys.add(value);
    }
  }
  const same = started && keys.size === applied.size && [...keys].every((k) => applied.has(k));
  if (same) return;
  started = true;
  applied = keys;

  configureHuggingFace({
    runtime: {
      source: "cdn",
      version: TRANSFORMERS_VERSION,
      url: `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TRANSFORMERS_VERSION}/dist/transformers.min.js`,
      // Les binaires ONNX Runtime ne sont pas dans le paquet transformers : onnxruntime-web
      // à la version exacte qu'il déclare.
      wasmPaths: `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`,
    },
    models,
    defaults: {load: "consent", consentAboveMB: 20, allowWasmUpToMB: MAX_MODEL_MB},
  });
}
