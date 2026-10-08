/**
 * Transformation du document avant garde et rendu.
 *
 * Viewer : identité. Embed : les composants Concorde sont préfixés `afx-` à la compilation
 * (isolation d'un éventuel Concorde de la page hôte), le document publié — qui parle
 * toujours `sonic-*` — est réécrit vers les noms réellement définis (voir src/embed).
 */
export type DocumentTransform = (doc: Record<string, unknown>) => Record<string, unknown>;

let current: DocumentTransform = (doc) => doc;

export function setDocumentTransform(fn: DocumentTransform): void {
  current = fn;
}

export function transformDocument(doc: Record<string, unknown>): Record<string, unknown> {
  return current(doc);
}
