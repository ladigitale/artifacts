/**
 * Pour `tsc` uniquement (Vite ne lit pas `paths`) : les addons creative-stack `3d`, `webgpu`
 * et `hugging-face-infer` ne sont importés que pour leurs effets (enregistrement des
 * composants). Leurs sources sont vérifiées dans leur dépôt (`yarn typecheck`) avec les types
 * three, @webgpu/types et @huggingface/transformers, qu'on n'installe pas ici
 * (transformers tirerait onnxruntime-node et sharp).
 */
export {};
