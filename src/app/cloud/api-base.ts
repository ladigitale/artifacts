const API_BASE_KEY = "artifacts-api-base-url";

const DEFAULT_API_BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_API_BASE_URL &&
    String(import.meta.env.VITE_API_BASE_URL)) ||
  "https://localhost:8443";

export function normalizeApiBase(url: string): string {
  return String(url || "")
    .trim()
    .replace(/\/$/, "")
    .replace(/\/api$/, "");
}

export function loadApiBaseUrl(): string {
  try {
    const stored = localStorage.getItem(API_BASE_KEY);
    if (stored?.trim()) return normalizeApiBase(stored);
  } catch {
    /* ignore */
  }
  return normalizeApiBase(DEFAULT_API_BASE);
}

export function saveApiBaseUrl(url: string): void {
  const normalized = normalizeApiBase(url);
  if (!normalized) return;
  localStorage.setItem(API_BASE_KEY, normalized);
}

export function explainFetchError(err: unknown, apiBase: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    const base = normalizeApiBase(apiBase) || "l’API";
    return (
      `Impossible de joindre ${base}. Vérifiez l’URL / le certificat HTTPS local (${base}/api/health).`
    );
  }
  return msg;
}
