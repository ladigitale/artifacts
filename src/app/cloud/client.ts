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
  description?: string | null;
  visibility: string;
  url: string;
  updatedAt: string;
  createdAt?: string;
  datasetId: string;
  currentVersion: number;
  hasLinkToken?: boolean;
  linkToken?: string | null;
};

export type ArtifactPatch = {
  title?: string;
  description?: string | null;
  slug?: string;
  visibility?: string;
};

export type PublicArtifact = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  document: Record<string, unknown>;
  scriptAssets?: {
    id: string;
    src: string;
    integrity?: string;
    css?: string[];
    global?: string;
  }[];
  concordeVersion: string;
  version: number;
  updatedAt: string;
  collections: string[];
  canWrite?: boolean;
  visibility: string;
};

/** Erreur HTTP de l’API (garde le statut pour distinguer 403 / 429 / 5xx). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

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
    throw new ApiError(text || `HTTP ${res.status}`, res.status);
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

function tadaaaWebUrl(): string {
  return (
    (typeof import.meta !== "undefined" &&
      import.meta.env?.VITE_TADAAA_URL &&
      String(import.meta.env.VITE_TADAAA_URL)) ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function tadaaaLoginUrl(returnTo: string): string {
  const url = new URL("/account/login", tadaaaWebUrl());
  url.searchParams.set("return_to", returnTo);
  return url.toString();
}

/** Page « Assistant IA » de Tadaaa (fournisseur, modèle, clé de l'agent). */
export function tadaaaAssistantSettingsUrl(): string {
  return new URL("/connectivity/assistant", tadaaaWebUrl()).toString();
}

/** État des réglages de l'agent de l'utilisateur (la clé n'est jamais renvoyée). */
export type AgentSettingsStatus = {
  configured: boolean;
  serverKeyAvailable: boolean;
  provider: string;
  model: string;
};

export async function fetchAgentSettingsStatus(): Promise<AgentSettingsStatus> {
  return apiFetch<AgentSettingsStatus>("/agent/settings");
}

/** Conversation de l'agent (historique de l'atelier). */
export type AgentThreadSummary = {
  threadId: string;
  title: string;
  artifactSlug: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentThread = AgentThreadSummary & {
  /** Journal à rejouer dans le chat (`ChatLogEntry`, agent-stack). */
  entries: unknown[];
  preview: {document?: Record<string, unknown>} | null;
  published: {slug?: string; url?: string; version?: number} | null;
};

export async function listAgentThreads(): Promise<AgentThreadSummary[]> {
  return (await apiFetch<{threads: AgentThreadSummary[]}>("/agent/artifacts/threads")).threads ?? [];
}

export async function getAgentThread(threadId: string): Promise<AgentThread> {
  return apiFetch(`/agent/artifacts/threads/${encodeURIComponent(threadId)}`);
}

export async function renameAgentThread(threadId: string, title: string): Promise<AgentThreadSummary> {
  return apiFetch(`/agent/artifacts/threads/${encodeURIComponent(threadId)}`, {
    method: "PATCH",
    body: JSON.stringify({title}),
  });
}

export async function deleteAgentThread(threadId: string): Promise<void> {
  await apiFetch(`/agent/artifacts/threads/${encodeURIComponent(threadId)}`, {method: "DELETE"});
}

export async function listMyArtifacts(): Promise<ArtifactSummary[]> {
  const data = await apiFetch<{member?: ArtifactSummary[]}>("/artifacts");
  return data.member ?? [];
}

export async function getArtifact(idOrSlug: string): Promise<ArtifactSummary & {document?: Record<string, unknown>}> {
  return apiFetch(`/artifacts/${encodeURIComponent(idOrSlug)}`);
}

export async function patchArtifact(
  idOrSlug: string,
  patch: ArtifactPatch,
): Promise<ArtifactSummary> {
  return apiFetch(`/artifacts/${encodeURIComponent(idOrSlug)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteArtifact(idOrSlug: string): Promise<void> {
  await apiFetch(`/artifacts/${encodeURIComponent(idOrSlug)}`, {method: "DELETE"});
}

export async function rotateLink(idOrSlug: string): Promise<ArtifactSummary> {
  return apiFetch(`/artifacts/${encodeURIComponent(idOrSlug)}/rotate-link`, {
    method: "POST",
    body: "{}",
  });
}

/** URL partageable locale (viewer) ; préfère `url` API si absolue du même host viewer. */
export function artifactSharePath(a: Pick<ArtifactSummary, "slug" | "url" | "visibility">): string {
  try {
    const u = new URL(a.url, location.origin);
    if (u.origin === location.origin) {
      return `${u.pathname}${u.search}`;
    }
  } catch {
    /* ignore */
  }
  return `/${a.slug}/`;
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
  readKey?: string | null,
): Promise<unknown[]> {
  const params = new URLSearchParams();
  if (linkToken) params.set("k", linkToken);
  if (readKey) params.set("rk", readKey);
  const q = params.toString() ? `?${params}` : "";
  const data = await apiFetch<{member?: unknown[]}>(
    `/public/artifacts/${encodeURIComponent(slug)}/collections/${encodeURIComponent(collection)}${q}`,
  );
  return data.member ?? [];
}

export class IntakeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter: number | null,
  ) {
    super(message);
  }
}

/** Envoi anonyme vers une collection `intake` (collecte ouverte par l’éditeur). */
export async function postIntakeRecord(
  slug: string,
  collection: string,
  data: Record<string, unknown>,
  code?: string | null,
  linkToken?: string | null,
): Promise<{id: string}> {
  const q = linkToken ? `?k=${encodeURIComponent(linkToken)}` : "";
  const base = `${normalizeApiBase(loadApiBaseUrl())}/api`;
  const res = await fetch(
    `${base}/public/artifacts/${encodeURIComponent(slug)}/collections/${encodeURIComponent(collection)}/records${q}`,
    {
      method: "POST",
      headers: {Accept: "application/json", "Content-Type": "application/json"},
      body: JSON.stringify(code ? {data, code} : {data}),
    },
  );
  if (res.ok) return (await res.json()) as {id: string};
  let message = `HTTP ${res.status}`;
  try {
    const j = (await res.json()) as {detail?: string; title?: string; error?: string};
    message = j.detail || j.error || j.title || message;
  } catch {
    /* corps non JSON */
  }
  const ra = Number(res.headers.get("Retry-After"));
  throw new IntakeError(message, res.status, Number.isFinite(ra) && ra > 0 ? ra : null);
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
