import {
  clearArtifactsAccount,
  getApiRoot,
  loadArtifactsAccount,
  saveArtifactsAccount,
  type ArtifactsAccount,
} from "./account";
import {loadApiBaseUrl, normalizeApiBase} from "./api-base";

export type ArtifactSummary = {
  id: string;
  slug: string;
  title: string;
  visibility: string;
  url: string;
  updatedAt: string;
  datasetId: string;
  currentVersion: number;
};

export type PublicArtifact = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  document: Record<string, unknown>;
  concordeVersion: string;
  version: number;
  updatedAt: string;
  collections: string[];
  canWrite?: boolean;
  visibility: string;
};

async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  account?: ArtifactsAccount | null,
): Promise<T> {
  const acc = account === undefined ? loadArtifactsAccount() : account;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (acc?.token) {
    headers.set("Authorization", `Bearer ${acc.token}`);
  }
  const base = acc ? getApiRoot(acc) : `${normalizeApiBase(loadApiBaseUrl())}/api`;
  const res = await fetch(`${base}${path}`, {...init, headers});
  if (res.status === 401 && acc) {
    clearArtifactsAccount();
    throw new Error("Session expirée");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function exchangeHandoff(
  apiBaseUrl: string,
  code: string,
): Promise<ArtifactsAccount> {
  const base = normalizeApiBase(apiBaseUrl);
  const res = await fetch(`${base}/api/auth/handoff/exchange`, {
    method: "POST",
    headers: {"Content-Type": "application/json", Accept: "application/json"},
    body: JSON.stringify({code}),
  });
  if (!res.ok) {
    throw new Error("Handoff invalide ou expiré — reconnectez-vous via Tadaaa");
  }
  const body = (await res.json()) as {
    token: string;
    user?: ArtifactsAccount["user"];
  };
  const account: ArtifactsAccount = {
    apiBaseUrl: base,
    token: body.token,
    user: body.user,
  };
  saveArtifactsAccount(account);
  return account;
}

export function tadaaaLoginUrl(returnTo: string): string {
  const tadaaa =
    (typeof import.meta !== "undefined" &&
      import.meta.env?.VITE_TADAAA_URL &&
      String(import.meta.env.VITE_TADAAA_URL)) ||
    "http://localhost:3000";
  const url = new URL("/account/login", tadaaa.replace(/\/$/, ""));
  url.searchParams.set("return_to", returnTo);
  return url.toString();
}

export async function listMyArtifacts(): Promise<ArtifactSummary[]> {
  const data = await apiFetch<{member?: ArtifactSummary[]}>("/artifacts");
  return data.member ?? [];
}

export async function fetchPublicArtifact(
  slug: string,
  linkToken?: string | null,
): Promise<PublicArtifact> {
  const q = linkToken ? `?k=${encodeURIComponent(linkToken)}` : "";
  return apiFetch<PublicArtifact>(`/public/artifacts/${encodeURIComponent(slug)}${q}`);
}

export async function fetchPublicCollection(
  slug: string,
  collection: string,
  linkToken?: string | null,
): Promise<unknown[]> {
  const q = linkToken ? `?k=${encodeURIComponent(linkToken)}` : "";
  const data = await apiFetch<{member?: unknown[]}>(
    `/public/artifacts/${encodeURIComponent(slug)}/collections/${encodeURIComponent(collection)}${q}`,
  );
  return data.member ?? [];
}

export async function listVersions(idOrSlug: string): Promise<
  {version: number; createdAt: string; note?: string | null; current: boolean}[]
> {
  const data = await apiFetch<{member?: {version: number; createdAt: string; note?: string | null; current: boolean}[]}>(
    `/artifacts/${encodeURIComponent(idOrSlug)}/versions`,
  );
  return data.member ?? [];
}

export async function restoreVersion(idOrSlug: string, n: number): Promise<unknown> {
  return apiFetch(`/artifacts/${encodeURIComponent(idOrSlug)}/versions/${n}/restore`, {
    method: "POST",
    body: "{}",
  });
}
