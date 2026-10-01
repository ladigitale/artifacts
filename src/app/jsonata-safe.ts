/**
 * Transforms d’enveloppe artefacts — JSONata réel (pas d’eval, CSP OK).
 */
import {compileJsonata} from "@supersoniks/concorde/utils/jsonataRuntime";

export type TransformMap = Record<string, {jsonata: string}>;

/** Transforms d’enveloppe (pas les reducers de store). */
const MAX_EXPR = 4096;

export function applySafeTransforms(
  sources: Record<string, unknown>,
  transforms: TransformMap | undefined,
): Record<string, unknown> {
  if (!transforms) return {};
  const out: Record<string, unknown> = {};
  for (const [key, tr] of Object.entries(transforms)) {
    const expr = (tr?.jsonata ?? "").trim();
    if (!expr || expr.length > MAX_EXPR) continue;
    try {
      const compiled = compileJsonata(expr);
      out[key] = compiled.evaluate(sources);
    } catch {
      // Expression invalide / non supportée : ignorer.
    }
  }
  return out;
}
