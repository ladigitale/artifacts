/**
 * Transforms jsonata — Concorde 4.9.3 n’embarque pas sonic-jsonata.
 * Sous-ensemble sûr uniquement (pas d’eval) : $count(name), littéraux numériques.
 * Timeout / taille bornés côté appelant.
 */
export type TransformMap = Record<string, {jsonata: string}>;

const MAX_EXPR = 2048;
const MAX_INPUT_ITEMS = 10_000;

export function applySafeTransforms(
  sources: Record<string, unknown>,
  transforms: TransformMap | undefined,
): Record<string, unknown> {
  if (!transforms) return {};
  const out: Record<string, unknown> = {};
  for (const [key, tr] of Object.entries(transforms)) {
    const expr = (tr?.jsonata ?? "").trim();
    if (!expr || expr.length > MAX_EXPR) continue;
    const countMatch = /^\$count\(([a-zA-Z_][a-zA-Z0-9_]*)\)$/.exec(expr);
    if (countMatch) {
      const src = sources[countMatch[1]];
      const arr = Array.isArray(src)
        ? src
        : src && typeof src === "object" && Array.isArray((src as {member?: unknown}).member)
          ? (src as {member: unknown[]}).member
          : null;
      if (arr && arr.length <= MAX_INPUT_ITEMS) {
        out[key] = arr.length;
      }
      continue;
    }
    // Expression non supportée sans eval — ignore silencieusement
  }
  return out;
}
