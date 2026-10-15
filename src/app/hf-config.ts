/**
 * Configuration de `sonic-hugging-face-infer` pour le viewer.
 *
 * Sans cet appel le composant reste inactif (« configureHuggingFace() n'a pas été
 * appelé ») : l'attribut `model` d'un artefact est un ALIAS de la liste blanche ci-dessous,
 * jamais un identifiant Hugging Face libre. Un artefact (généré par un LLM) ne peut donc
 * charger que ces modèles, à ces révisions, avec ces options.
 *
 * Appelé à la demande par `addons.ts` quand un document utilise le composant : rien n'est
 * chargé ni configuré pour les autres artefacts.
 *
 * Ajouter un modèle :
 *   node node_modules/@supersoniks/creative-stack/scripts/hf-vendor.mjs model <repo> <sha> --dtype q8
 * (vérifie taille et licence), puis déclarer l'alias ici avec le sha du commit.
 */
import {
  configureHuggingFace,
  defineHuggingFaceModels,
} from "@supersoniks/creative-stack/hugging-face-infer";

/** Moteur : Transformers.js, version exacte (jamais un tag), servi par jsDelivr (CSP : script-src/worker-src). */
const TRANSFORMERS_VERSION = "4.3.0";
/** onnxruntime-web attendu par Transformers.js 4.3.0 (voir sa package.json). */
const ORT_VERSION = "1.31.0-dev.20260914-8d85527a0";

export const HF_MODELS = defineHuggingFaceModels({
  /** Carte de profondeur d'une photo (≈ 27 Mo quantifié). Alimente un `sonic-shader` (relief). */
  "depth-small": {
    task: "depth-estimation",
    repo: "Xenova/depth-anything-small-hf",
    revision: "2e942621ab9f2371c1df9eb223291b5ac31475e6",
    options: {dtype: "q8"},
    // CPU (WASM) uniquement : les builds WebGPU d'ONNX Runtime pèsent 27-28 Mo, au-delà de
    // ce que jsDelivr sert pour un fichier npm. Le build CPU (14 Mo) passe.
    devices: ["wasm"],
    sizeBytes: 27_000_000,
    license: "apache-2.0",
    label: "Profondeur d'image",
    description: "Estime la profondeur d'une photo, localement dans ton navigateur.",
  },
  /** Classement d'un texte parmi des étiquettes libres (≈ 25 Mo quantifié). */
  "zero-shot": {
    task: "zero-shot-classification",
    repo: "Xenova/mobilebert-uncased-mnli",
    revision: "8b0ea66ab7b190bba77418ba03b67d69cfc9a1ee",
    options: {dtype: "q8"},
    devices: ["wasm"],
    sizeBytes: 25_000_000,
    label: "Classement de texte",
    description: "Classe un texte (anglais) parmi les étiquettes proposées, localement.",
  },
});

let configured = false;

/** Idempotent : à appeler avant le rendu d'un document qui utilise `sonic-hugging-face-infer`. */
export function configureViewerHuggingFace(): void {
  if (configured) return;
  configured = true;
  configureHuggingFace({
    runtime: {
      source: "cdn",
      version: TRANSFORMERS_VERSION,
      url: `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TRANSFORMERS_VERSION}/dist/transformers.min.js`,
      // Les binaires ONNX Runtime ne sont pas dans le paquet transformers : on pointe
      // onnxruntime-web à la version exacte qu'il déclare.
      wasmPaths: `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`,
    },
    models: HF_MODELS,
    defaults: {load: "consent", consentAboveMB: 20, allowWasmUpToMB: 50},
  });
}
