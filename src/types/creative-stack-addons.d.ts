/**
 * Pour `tsc` uniquement (Vite ne lit pas `paths`) : les addons creative-stack `3d`, `webgpu`
 * et `hugging-face-infer` ne sont importés que pour leurs effets (enregistrement des
 * composants). Leurs sources sont vérifiées dans leur dépôt (`yarn typecheck`) avec les types
 * three, @webgpu/types et @huggingface/transformers, qu'on n'installe pas ici
 * (transformers tirerait onnxruntime-node et sharp).
 *
 * `hugging-face-infer` est aussi configuré par le viewer (`src/app/hf-config.ts`) : ce fichier
 * (cible du `paths` de tsconfig) en déclare la forme utilisée ici ; la vérification complète
 * est faite dans la creative-stack.
 */
type HfModelDef = {
  task: string;
  repo: string;
  revision: string;
  options?: Record<string, unknown>;
  devices?: readonly ("webgpu" | "wasm")[];
  sizeBytes?: number;
  license?: string;
  label?: string;
  description?: string;
  defaults?: Record<string, unknown>;
};

export declare function defineHuggingFaceModels<const M extends Record<string, HfModelDef>>(models: M): M;

export declare function configureHuggingFace(config: {
  runtime: {source: "cdn"; url: string; version: string; wasmPaths?: string | {mjs: string; wasm: string}};
  models: Record<string, HfModelDef>;
  remoteHost?: string;
  remotePathTemplate?: string;
  defaults?: Record<string, unknown>;
}): unknown;
