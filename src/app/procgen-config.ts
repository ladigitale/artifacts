/**
 * Monde infini de `sonic-procgen` : les tuiles se composent dans un worker construit par le viewer (même origine,
 * CSP `worker-src 'self' blob:`), le fil principal ne fait plus que l'envoi à la carte graphique. Sans Worker, ou
 * si le worker échoue, procgen compose sur le fil principal par tranches.
 *
 * Le même script sert aussi le pool qui construit les personnages en parallèle avant une composition 3D (gardés
 * ensuite dans IndexedDB) : premier chargement d'une scène peuplée bien plus court, deuxième quasi immédiat.
 *
 * Appelé à la demande par `addons.ts` : rien n'est chargé pour les artefacts sans le composant.
 */
import {setProcgenCharacterWorkers, setProcgenTileRunner, WorkerTileRunner} from "@supersoniks/creative-stack/procgen";

let done = false;

export function configureViewerProcgen(): void {
  if (done) return;
  done = true;
  setProcgenTileRunner(() =>
    typeof Worker === "undefined"
      ? null
      : new WorkerTileRunner(new Worker(new URL("./procgen-tiles.worker.ts", import.meta.url), {type: "module", name: "procgen-tuiles"})),
  );
  if (typeof Worker !== "undefined")
    setProcgenCharacterWorkers(() => new Worker(new URL("./procgen-tiles.worker.ts", import.meta.url), {type: "module", name: "procgen-personnages"}));
}
