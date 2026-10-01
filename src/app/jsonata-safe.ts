/**
 * Transforms d’enveloppe artefacts — JSONata réel (pas d’eval, CSP OK).
 * Remplace l’évaluateur maison limité à $count : même résultats pour les
 * expressions courantes (`$count(name)`, filtres, `$round`, objets),
 * et les apostrophes droites dans les littéraux ne sont plus cassées.
 */
import {compileJsonata} from "@supersoniks/concorde/utils/jsonataRuntime";

export type TransformMap = Record<string, {jsonata: string}>;

const MAX_EXPR = 2048;

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
      // Expression invalide / non supportée : ignorer (comportement précédent).
    }
  }
  return out;
}
