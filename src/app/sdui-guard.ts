const FORBIDDEN_NODE = new Set(["markup", "innerHTML", "prefix", "suffix", "js", "css"]);

export type GuardError = {path: string; message: string};

export function guardDocument(doc: unknown): GuardError[] {
  const errors: GuardError[] = [];
  if (!doc || typeof doc !== "object") {
    return [{path: "", message: "Document invalide."}];
  }
  const d = doc as Record<string, unknown>;
  if (d.schema !== "artifacts/1") {
    errors.push({path: "/schema", message: 'schema doit être "artifacts/1".'});
  }
  const views = d.views;
  if (!Array.isArray(views)) {
    errors.push({path: "/views", message: "views requis."});
    return errors;
  }
  const walk = (node: unknown, path: string) => {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    for (const k of FORBIDDEN_NODE) {
      if (k in n) errors.push({path: `${path}/${k}`, message: `"${k}" interdit.`});
    }
    const tag = String(n.tagName ?? "div").toLowerCase();
    if (tag === "script" || tag.includes("script")) {
      errors.push({path: `${path}/tagName`, message: "script interdit."});
    }
    const attrs = n.attributes;
    if (attrs && typeof attrs === "object") {
      for (const [attr, val] of Object.entries(attrs as Record<string, unknown>)) {
        if (/^on/i.test(attr) && typeof val === "string") {
          errors.push({path: `${path}/attributes/${attr}`, message: "handler interdit."});
        }
        if (typeof val === "string" && /^\s*javascript:/i.test(val)) {
          errors.push({path: `${path}/attributes/${attr}`, message: "URL javascript interdite."});
        }
      }
    }
    if (Array.isArray(n.nodes)) n.nodes.forEach((c, i) => walk(c, `${path}/nodes/${i}`));
  };
  views.forEach((v, i) => {
    if (v && typeof v === "object" && (v as {root?: unknown}).root) {
      walk((v as {root: unknown}).root, `/views/${i}/root`);
    }
  });
  return errors;
}
