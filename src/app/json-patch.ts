/**
 * JSON Patch (RFC 6902) sans mutation : add, remove, replace, move, copy, test.
 * Tout ou rien : une opération invalide lève une erreur et l'original n'est pas touché.
 * Même sémantique que le JsonPatch de Tadaaa (qui valide les document.patch d'un flux).
 */
export type PatchOp = {op: string; path: string; value?: unknown; from?: string};

export function applyPatch<T>(doc: T, ops: PatchOp[]): T {
  let out: unknown = clone(doc);
  ops.forEach((op, i) => {
    try {
      out = applyOne(out, op);
    } catch (e) {
      throw new Error(`patch[${i}] : ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  return out as T;
}

/** Valeur au pointeur (undefined si absente). */
export function getPointer(doc: unknown, pointer: string): unknown {
  let cur = doc;
  for (const seg of split(pointer)) {
    if (Array.isArray(cur) && isIndex(seg) && Number(seg) < cur.length) cur = cur[Number(seg)];
    else if (isObject(cur) && Object.prototype.hasOwnProperty.call(cur, seg)) cur = cur[seg];
    else return undefined;
  }
  return cur;
}

/** Écrit `value` au pointeur en créant les objets intermédiaires manquants (pistes d'une partition). */
export function setPointer<T>(doc: T, pointer: string, value: unknown): T {
  const segs = split(pointer);
  if (!segs.length) return value as T;
  const root: unknown = isObject(doc) || Array.isArray(doc) ? shallow(doc) : {};
  let cur = root as Record<string, unknown> | unknown[];
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    const next = Array.isArray(cur) ? cur[Number(seg)] : cur[seg];
    const copy = isObject(next) || Array.isArray(next) ? shallow(next) : {};
    if (Array.isArray(cur)) cur[Number(seg)] = copy;
    else cur[seg] = copy;
    cur = copy as Record<string, unknown> | unknown[];
  }
  const last = segs[segs.length - 1];
  if (Array.isArray(cur)) cur[last === "-" ? cur.length : Number(last)] = value;
  else cur[last] = value;
  return root as T;
}

function applyOne(doc: unknown, op: PatchOp): unknown {
  if (!op || typeof op.path !== "string") throw new Error("opération attendue {op, path, …}");
  switch (op.op) {
    case "add":
      return add(doc, op.path, clone(requireValue(op)));
    case "remove":
      return remove(doc, op.path);
    case "replace":
      if (getPointer(doc, op.path) === undefined && op.path !== "") throw new Error(`chemin introuvable : ${op.path}`);
      return op.path === "" ? clone(requireValue(op)) : add(remove(doc, op.path), op.path, clone(requireValue(op)), true);
    case "move": {
      const from = requireFrom(op);
      const v = getPointer(doc, from);
      if (v === undefined) throw new Error(`chemin introuvable : ${from}`);
      return add(remove(doc, from), op.path, v);
    }
    case "copy": {
      const from = requireFrom(op);
      const v = getPointer(doc, from);
      if (v === undefined) throw new Error(`chemin introuvable : ${from}`);
      return add(doc, op.path, clone(v));
    }
    case "test":
      if (JSON.stringify(getPointer(doc, op.path)) !== JSON.stringify(requireValue(op))) throw new Error(`test échoué : ${op.path}`);
      return doc;
    default:
      throw new Error(`op inconnue : ${op.op}`);
  }
}

function add(doc: unknown, path: string, value: unknown, replacing = false): unknown {
  const segs = split(path);
  if (!segs.length) return value;
  return edit(doc, segs, (parent, key) => {
    if (Array.isArray(parent)) {
      const idx = key === "-" ? parent.length : Number(key);
      if (!isIndex(key) && key !== "-") throw new Error(`index invalide : ${key}`);
      if (idx > parent.length) throw new Error(`index hors limites : ${key}`);
      parent.splice(idx, replacing ? 0 : 0, value);
      return;
    }
    (parent as Record<string, unknown>)[key] = value;
  });
}

function remove(doc: unknown, path: string): unknown {
  const segs = split(path);
  if (!segs.length) throw new Error("impossible de retirer la racine");
  return edit(doc, segs, (parent, key) => {
    if (Array.isArray(parent)) {
      if (!isIndex(key) || Number(key) >= parent.length) throw new Error(`chemin introuvable : ${path}`);
      parent.splice(Number(key), 1);
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(parent, key)) throw new Error(`chemin introuvable : ${path}`);
    delete (parent as Record<string, unknown>)[key];
  });
}

/** Copie le chemin jusqu'au parent, puis applique `fn` sur le parent copié. */
function edit(doc: unknown, segs: string[], fn: (parent: Record<string, unknown> | unknown[], key: string) => void): unknown {
  const root = shallowContainer(doc, "");
  let cur = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    const next = Array.isArray(cur) ? (isIndex(seg) ? cur[Number(seg)] : undefined) : cur[seg];
    const copy = shallowContainer(next, "/" + segs.slice(0, i + 1).join("/"));
    if (Array.isArray(cur)) cur[Number(seg)] = copy;
    else cur[seg] = copy;
    cur = copy;
  }
  fn(cur, segs[segs.length - 1]);
  return root;
}

function shallowContainer(v: unknown, at: string): Record<string, unknown> | unknown[] {
  if (Array.isArray(v)) return [...v];
  if (isObject(v)) return {...v};
  throw new Error(`chemin introuvable : ${at || "/"}`);
}

function shallow(v: unknown): Record<string, unknown> | unknown[] {
  return Array.isArray(v) ? [...v] : {...(v as Record<string, unknown>)};
}

function requireValue(op: PatchOp): unknown {
  if (!("value" in op)) throw new Error("value requis");
  return op.value;
}

function requireFrom(op: PatchOp): string {
  if (typeof op.from !== "string") throw new Error("from requis");
  return op.from;
}

function split(pointer: string): string[] {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) throw new Error(`pointeur invalide : ${pointer}`);
  return pointer
    .slice(1)
    .split("/")
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function isIndex(s: string): boolean {
  return /^(0|[1-9][0-9]*)$/.test(s);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}
