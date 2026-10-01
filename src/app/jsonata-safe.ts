/**
 * Transforms jsonata — pas d’eval (CSP).
 * Supporté :
 * - littéral objet JSON / quasi-JSON (`{ "a": 1 }` ou `{ 'a': 1 }`)
 * - `$count(name)`
 * - `$count(name[field='val'])` / `$count(name[field="val"])`
 * - `{ 'value': <expr> }` enveloppe simple autour d’un $count / littéral
 * - `$round(x)` autour d’une expression arithmétique simple sur counts
 */
export type TransformMap = Record<string, {jsonata: string}>;

const MAX_EXPR = 2048;
const MAX_INPUT_ITEMS = 10_000;

function asArray(src: unknown): unknown[] | null {
  if (Array.isArray(src)) return src;
  if (src && typeof src === "object" && Array.isArray((src as {member?: unknown}).member)) {
    return (src as {member: unknown[]}).member;
  }
  return null;
}

function countSource(sources: Record<string, unknown>, name: string): number {
  const arr = asArray(sources[name]);
  if (!arr || arr.length > MAX_INPUT_ITEMS) return 0;
  return arr.length;
}

function countFiltered(
  sources: Record<string, unknown>,
  name: string,
  field: string,
  value: string,
): number {
  const arr = asArray(sources[name]);
  if (!arr || arr.length > MAX_INPUT_ITEMS) return 0;
  return arr.filter((row) => {
    if (!row || typeof row !== "object") return false;
    const data =
      "data" in row && typeof (row as {data: unknown}).data === "object"
        ? ((row as {data: Record<string, unknown>}).data ?? {})
        : (row as Record<string, unknown>);
    return String(data[field] ?? "") === value;
  }).length;
}

/** Parse object / array literal without eval. */
function tryParseLiteral(expr: string): unknown | undefined {
  let s = expr.trim();
  if (!(s.startsWith("{") || s.startsWith("["))) return undefined;
  // single-quoted keys/strings → JSON (safe enough for our agent outputs)
  s = s.replace(/'/g, '"');
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

function evalCountCall(sources: Record<string, unknown>, call: string): number | null {
  const plain = /^\$count\(([a-zA-Z_][a-zA-Z0-9_]*)\)$/.exec(call);
  if (plain) return countSource(sources, plain[1]);

  const filtered =
    /^\$count\(([a-zA-Z_][a-zA-Z0-9_]*)\[([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*['"]([^'"]*)['"]\]\)$/.exec(
      call,
    );
  if (filtered) return countFiltered(sources, filtered[1], filtered[2], filtered[3]);
  return null;
}

/**
 * Evaluate a small arithmetic expression using $count(...) tokens only.
 * Returns null if unsupported.
 */
function evalSimpleArithmetic(expr: string): number | null {
  const s = expr.replace(/\s+/g, "");
  if (!s || !/^[\d+\-*/().]+$/.test(s)) return null;
  let i = 0;
  const peek = () => s[i];
  const eat = () => s[i++];
  const parseExpr = (): number | null => {
    let v = parseTerm();
    if (v === null) return null;
    while (peek() === "+" || peek() === "-") {
      const op = eat();
      const r = parseTerm();
      if (r === null) return null;
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const parseTerm = (): number | null => {
    let v = parseFactor();
    if (v === null) return null;
    while (peek() === "*" || peek() === "/") {
      const op = eat();
      const r = parseFactor();
      if (r === null) return null;
      v = op === "*" ? v * r : r === 0 ? null : v / r;
      if (v === null) return null;
    }
    return v;
  };
  const parseFactor = (): number | null => {
    if (peek() === "(") {
      eat();
      const v = parseExpr();
      if (peek() !== ")") return null;
      eat();
      return v;
    }
    if (peek() === "-") {
      eat();
      const v = parseFactor();
      return v === null ? null : -v;
    }
    let start = i;
    while (peek() && /[\d.]/.test(peek())) eat();
    if (start === i) return null;
    const n = Number(s.slice(start, i));
    return Number.isFinite(n) ? n : null;
  };
  const v = parseExpr();
  return i === s.length ? v : null;
}

function evalCountArithmetic(sources: Record<string, unknown>, expr: string): number | null {
  let s = expr.replace(/\s+/g, " ").trim();
  const round = /^\$round\((.*)\)$/.exec(s);
  if (round) {
    const inner = evalCountArithmetic(sources, round[1]);
    return inner === null ? null : Math.round(inner);
  }

  const countRe =
    /\$count\([a-zA-Z_][a-zA-Z0-9_]*(?:\[[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*['"][^'"]*['"]\])?\)/g;
  const replaced = s.replace(countRe, (m) => {
    const n = evalCountCall(sources, m);
    return n === null ? "NaN" : String(n);
  });
  if (replaced.includes("$") || /[a-zA-Z_]/.test(replaced.replace(/NaN/g, ""))) {
    return null;
  }
  if (replaced.includes("NaN")) return null;
  return evalSimpleArithmetic(replaced);
}

function evalObjectWithCounts(
  sources: Record<string, unknown>,
  expr: string,
): Record<string, unknown> | undefined {
  // Shape: { 'key': <arith>, ... } where arith uses $count / $round / numbers
  let s = expr.trim();
  if (!s.startsWith("{") || !s.endsWith("}")) return undefined;
  s = s.slice(1, -1).trim();
  if (!s) return {};

  const out: Record<string, unknown> = {};
  // split on commas at depth 0
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    if (ch === ")" || ch === "]" || ch === "}") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());

  for (const part of parts) {
    const m = /^(['"])([^'"]+)\1\s*:\s*(.+)$/.exec(part);
    if (!m) return undefined;
    const key = m[2];
    const valExpr = m[3].trim();
    // ternary: cond ? a : b  — only with $count > 0 style
    const tern = /^(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/.exec(valExpr);
    if (tern) {
      const cond = tern[1].trim();
      // $count(x) > 0
      const cmp = /^\$count\(([a-zA-Z_][a-zA-Z0-9_]*)\)\s*>\s*0$/.exec(cond);
      if (!cmp) return undefined;
      const ok = countSource(sources, cmp[1]) > 0;
      const branch = ok ? tern[2].trim() : tern[3].trim();
      const n = evalCountArithmetic(sources, branch);
      if (n === null) return undefined;
      out[key] = n;
      continue;
    }
    if (/^['"].*['"]$/.test(valExpr)) {
      out[key] = valExpr.slice(1, -1);
      continue;
    }
    if (/^-?\d+(\.\d+)?$/.test(valExpr)) {
      out[key] = Number(valExpr);
      continue;
    }
    const n = evalCountArithmetic(sources, valExpr);
    if (n === null) return undefined;
    out[key] = n;
  }
  return out;
}

export function applySafeTransforms(
  sources: Record<string, unknown>,
  transforms: TransformMap | undefined,
): Record<string, unknown> {
  if (!transforms) return {};
  const out: Record<string, unknown> = {};
  for (const [key, tr] of Object.entries(transforms)) {
    const expr = (tr?.jsonata ?? "").trim();
    if (!expr || expr.length > MAX_EXPR) continue;

    const literal = tryParseLiteral(expr);
    if (literal !== undefined) {
      out[key] = literal;
      continue;
    }

    const countOnly = evalCountCall(sources, expr);
    if (countOnly !== null) {
      out[key] = countOnly;
      continue;
    }

    const obj = evalObjectWithCounts(sources, expr);
    if (obj !== undefined) {
      out[key] = obj;
      continue;
    }
  }
  return out;
}
