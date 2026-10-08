/**
 * Préfixage des noms de DataProviders / stores d'un document (voir claimNamespace).
 *
 * N'intervient qu'en cas de collision entre artefacts d'une même page : avec un préfixe
 * vide, toutes ces fonctions rendent leur entrée telle quelle.
 *
 * Règle : une valeur d'attribut est un nom de DataProvider si elle vaut exactement un nom
 * déclaré par le document, ou commence par `nom.` (chemin). Les noms déclarés sont ceux
 * des `data.sources` (et leurs collections), `data.transforms`, `data.stores` et des
 * `sonic-store` / `dataProvider` des vues.
 */

const STORE_TAG = "sonic-store";
const NAME = /^[A-Za-z_][\w:-]*$/;

type Node = Record<string, unknown>;

function rootOf(value: string): string {
  const i = value.indexOf(".");
  return i === -1 ? value : value.slice(0, i);
}

function addName(out: Set<string>, value: unknown): void {
  if (typeof value !== "string") return;
  const root = rootOf(value.trim());
  if (NAME.test(root)) out.add(root);
}

function isStoreNode(n: Node): boolean {
  return typeof n.tagName === "string" && n.tagName.toLowerCase() === STORE_TAG;
}

function collectFromNode(node: unknown, out: Set<string>, depth = 0): void {
  if (depth > 64 || !node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((c) => collectFromNode(c, out, depth + 1));
    return;
  }
  const n = node as Node;
  const attrs = n.attributes as Node | undefined;
  if (attrs && typeof attrs === "object") {
    addName(out, attrs.dataProvider);
    if (isStoreNode(n)) addName(out, attrs.id);
  }
  if (Array.isArray(n.nodes)) collectFromNode(n.nodes, out, depth + 1);
}

/** Noms que le document publie ou lit dans le PublisherManager. */
export function declaredNames(doc: unknown, slug: string): Set<string> {
  const out = new Set<string>([`artifact:${slug}`]);
  const d = (doc ?? {}) as {
    data?: {
      sources?: Record<string, {collection?: string}>;
      transforms?: Record<string, unknown>;
      stores?: Record<string, {dataProvider?: string}>;
    };
    views?: {root?: unknown}[];
  };
  for (const [name, src] of Object.entries(d.data?.sources ?? {})) {
    addName(out, name);
    addName(out, src?.collection);
  }
  for (const name of Object.keys(d.data?.transforms ?? {})) addName(out, name);
  for (const [id, def] of Object.entries(d.data?.stores ?? {})) {
    addName(out, id);
    addName(out, def?.dataProvider);
  }
  for (const v of d.views ?? []) collectFromNode(v?.root, out);
  return out;
}

export function nsName(ns: string, name: string): string {
  return ns ? ns + name : name;
}

/** Préfixe une valeur si elle désigne un nom déclaré (ou un chemin sous ce nom). */
export function nsValue(ns: string, names: Set<string>, value: string): string {
  if (!ns) return value;
  const trimmed = value.trim();
  const root = rootOf(trimmed);
  if (names.has(root) && NAME.test(root)) return ns + trimmed;
  // Clés publiées par le viewer : `artifact:<slug>:<source>`.
  for (const n of names) {
    if (n.startsWith("artifact:") && root.startsWith(n + ":")) return ns + trimmed;
  }
  return value;
}

/** Copie d'un arbre de vue avec ses références de DataProviders préfixées. */
export function nsTree<T>(ns: string, names: Set<string>, node: T, depth = 0): T {
  if (!ns || depth > 64 || !node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map((c) => nsTree(ns, names, c, depth + 1)) as T;
  const n = node as Node;
  const out: Node = {...n};
  const attrs = n.attributes as Node | undefined;
  if (attrs && typeof attrs === "object") {
    const store = isStoreNode(n);
    const next: Node = {};
    for (const [k, v] of Object.entries(attrs)) {
      // `id` n'est un nom de store que sur sonic-store (ailleurs : cible #id des shaders…).
      next[k] = typeof v === "string" && (k !== "id" || store) ? nsValue(ns, names, v) : v;
    }
    out.attributes = next;
  }
  if (Array.isArray(n.nodes)) out.nodes = nsTree(ns, names, n.nodes, depth + 1);
  return out as T;
}
