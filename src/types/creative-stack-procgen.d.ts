/**
 * Pour `tsc` uniquement (Vite ne lit pas `paths`) : forme utilisée par le viewer de l'addon `procgen` et de son
 * worker de tuiles (`src/app/procgen-config.ts`, `src/app/procgen-tiles.worker.ts`). Les sources sont vérifiées dans
 * la creative-stack (`yarn typecheck`, avec les types three qu'on n'installe pas ici).
 */
export type TileRunner = {busy: boolean; dispose(): void};
export declare function setProcgenTileRunner(f: (() => TileRunner | null) | null): void;
export declare class WorkerTileRunner implements TileRunner {
  constructor(worker: unknown);
  readonly busy: boolean;
  readonly usingWorker: boolean;
  dispose(): void;
}
export declare function serveTileWorker(scope: unknown): void;
