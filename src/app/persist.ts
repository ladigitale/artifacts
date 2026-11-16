/**
 * Sauvegarde locale d'un artefact (`data.persist`) : l'état de DataProviders choisis survit au rechargement de la
 * page, dans le navigateur de la personne (localStorage), sans compte ni serveur.
 *
 *   "data": {"persist": {"providers": ["chambre", "piece"], "version": 1}}
 *
 * - un store listé reçoit l'attribut `persist` (clé ci-dessous) : sonic-store reprend et enregistre son état lui-même,
 *   et `@reset` le ramène à son `initial` ;
 * - une transform listée est republiée depuis sa sauvegarde au premier calcul, puis enregistrée à chaque changement
 *   (formulaires qui écrivent dedans comprises).
 *
 * Changer `version` abandonne les sauvegardes précédentes (document dont la forme des données a changé).
 */

export type PersistDecl = {providers: string[]; version: number};
// `online: true` (et `status`, nom d'un DataProvider d'état) : voir online-save.ts

// une sauvegarde peut porter de petites images (posters) : jusqu'à 1,2 Mo
const MAX_BYTES = 1200 * 1024;

/** Déclaration valide de `data.persist`, sinon null (même contrôle que la validation Tadaaa). */
export function persistDecl(doc: unknown): PersistDecl | null {
  const raw = (doc as {data?: {persist?: unknown}} | null)?.data?.persist;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as {providers?: unknown; version?: unknown};
  if (!Array.isArray(p.providers)) return null;
  const providers = p.providers.filter((x): x is string => typeof x === "string" && /^[A-Za-z][\w-]{0,63}$/.test(x)).slice(0, 8);
  if (!providers.length) return null;
  const version = Number.isInteger(p.version) && (p.version as number) >= 0 ? (p.version as number) : 0;
  return {providers, version};
}

/** Clé de stockage d'un DataProvider d'un artefact. */
export function persistKey(artifactId: string, decl: PersistDecl, provider: string): string {
  return `artefacts:persist:${artifactId}:v${decl.version}:${provider}`;
}

export function readSaved(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : undefined;
  } catch {
    return undefined;
  }
}

export function writeSaved(key: string, value: unknown): void {
  try {
    const raw = JSON.stringify(value);
    if (raw !== undefined && raw.length <= MAX_BYTES) localStorage.setItem(key, raw);
  } catch {
    /* stockage plein, refusé ou indisponible : l'état reste en mémoire */
  }
}

/** Copie simple d'une valeur de DataProvider (proxy Concorde compris). */
export function plain(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return undefined;
  }
}
