/**
 * Configuration des composants de suivi ML (`sonic-hand-tracker`, `sonic-face-tracker`, `sonic-pose-tracker`, `sonic-object-detector`, `sonic-segmenter`, `sonic-click-segmenter`, `sonic-image-embedder`) pour le viewer.
 *
 * Un modèle est une donnée, pas du code (le runtime MediaPipe est épinglé côté creative-stack).
 * Niveau « origins » : les modèles par alias, et les URL https dont l'origine est dans la liste par
 * défaut (hôtes MediaPipe, Hugging Face, jsDelivr) ou déclarée par le document
 * (`capabilities: [{"ml": ["https://…/"]}]`, validé à la publication par l'API). Chaque origine
 * demande le consentement de l'utilisateur avant le premier téléchargement.
 *
 * Appelé à la demande par `addons.ts` : rien n'est chargé pour les artefacts sans le composant.
 */
import {DEFAULT_POLICY, configureMl} from "@supersoniks/creative-stack/vision";
import {docMlOrigins} from "./sdui-guard";

export function configureViewerVision(doc: unknown): void {
  // Remplace (et non complète) : les origines d'un document ne valent pas pour un autre sur la même page.
  configureMl({level: "origins", origins: [...DEFAULT_POLICY.origins, ...docMlOrigins(doc)], replaceOrigins: true});
}
