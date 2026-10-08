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

/**
 * Espace de noms des DataProviders / stores d'un artefact.
 *
 * Un seul bundle = un seul PublisherManager pour toute la page : deux artefacts intégrés
 * qui déclarent tous deux un store `game` (ou deux fois le même artefact) se marcheraient
 * dessus. Le viewer annonce les noms que déclare son document ; le résolveur rend un
 * préfixe (vide s'il n'y a pas de collision) et une fonction de libération.
 * Viewer pleine page : toujours vide.
 */
export type NamespaceClaim = {ns: string; release: () => void};
export type NamespaceResolver = (slug: string, names: Set<string>) => NamespaceClaim;

let resolver: NamespaceResolver = () => ({ns: "", release: () => {}});

export function setNamespaceResolver(fn: NamespaceResolver): void {
  resolver = fn;
}

export function claimNamespace(slug: string, names: Set<string>): NamespaceClaim {
  return resolver(slug, names);
}
