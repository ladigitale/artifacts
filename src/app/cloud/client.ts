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
  /** Vrai quand la version affichée est un brouillon non publié (membres, `?draft=1`). */
  draft?: boolean;
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
    // Lecture publique (artefact public ou par lien, run…) : un jeton périmé ne doit pas la bloquer,
    // on la refait sans compte.
    if (path.startsWith("/public/")) return apiFetch<T>(path, init, null);
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

/** Inscription Tadaaa ; `returnTo` est repris dans le lien de confirmation envoyé par email. */
export function tadaaaRegisterUrl(returnTo: string): string {
  const url = new URL("/account/register", tadaaaWebUrl());
  url.searchParams.set("return_to", returnTo);
  return url.toString();
}

/**
 * Adresse de retour après connexion ou inscription. `next` voyage dans l'URL (et non en
 * sessionStorage) : le lien de confirmation d'email s'ouvre dans un nouvel onglet.
 */
export function cloudReturnUrl(next = "/admin"): string {
  const url = new URL("/cloud", location.origin);
  if (next !== "/admin") url.searchParams.set("next", next);
  return url.toString();
}

/** Chemin interne sûr (jamais une autre origine). */
export function safeNextPath(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  return /^\/(?![\/\\])[\w\-./?=&%#]*$/.test(v) ? v : "";
}

/** Adresse du serveur MCP de Tadaaa (même origine que l'API). */
export function mcpServerUrl(): string {
  const acc = loadArtifactsAccount();
  return `${normalizeApiBase(acc?.apiBaseUrl ?? loadApiBaseUrl()).replace(/\/api$/, "")}/mcp`;
}

/** Jeton d'accès personnel pour les clients MCP sans OAuth (Cursor…). Affiché une seule fois. */
export async function createMcpAccessToken(name: string): Promise<{plainToken: string; mcpUrl: string}> {
  return apiFetch<{plainToken: string; mcpUrl: string}>("/access-tokens", {
    method: "POST",
    body: JSON.stringify({name}),
  });
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

export type ResourceKind = "shader" | "model3d" | "data" | "image" | "audio";

export type ResourceSummary = {
  ref: string;
  source: "mine" | "base";
  kind: ResourceKind | string;
  slug: string;
  name: string;
  description?: string | null;
  tags: string[];
  prompt?: string | null;
  contentType?: string | null;
  version: number;
  sizeBytes?: number;
  sha256?: string;
  base?: {ref: string; version: number; latest: number} | null;
  updateAvailable?: boolean;
  createdAt?: string;
  updatedAt?: string;
  license?: string;
  channels?: unknown;
  params?: unknown;
};

export type ResourceVersion = {version: number; sizeBytes?: number; sha256?: string; createdAt?: string};

export type ResourceQuery = {q?: string; kind?: string; tag?: string; base?: boolean; limit?: number; offset?: number};

export async function listResources(query: ResourceQuery = {}): Promise<ResourceSummary[]> {
  const p = new URLSearchParams();
  if (query.q) p.set("q", query.q);
  if (query.kind) p.set("kind", query.kind);
  if (query.tag) p.set("tag", query.tag);
  if (query.base !== undefined) p.set("base", query.base ? "1" : "0");
  if (query.limit) p.set("limit", String(query.limit));
  if (query.offset) p.set("offset", String(query.offset));
  const qs = p.toString();
  const data = await apiFetch<{member?: ResourceSummary[]}>(`/resources${qs ? `?${qs}` : ""}`);
  return data.member ?? [];
}

export async function getResource(ref: string): Promise<{resource: ResourceSummary; versions: ResourceVersion[]}> {
  const data = await apiFetch<{resource: ResourceSummary; versions?: ResourceVersion[]}>(
    `/resources/${encodeURIComponent(ref)}`,
  );
  return {resource: data.resource, versions: data.versions ?? []};
}

/** Contenu brut (texte) d’une ressource ; null si binaire ou trop gros pour un aperçu. */
export async function getResourceContent(ref: string, version?: number, maxChars = 20000): Promise<string | null> {
  const acc = loadArtifactsAccount();
  const base = acc ? getApiRoot(acc) : `${normalizeApiBase(loadApiBaseUrl())}/api`;
  const headers = new Headers();
  if (acc?.token) headers.set("Authorization", `Bearer ${acc.token}`);
  const q = version ? `?version=${version}` : "";
  const res = await fetch(`${base}/resources/${encodeURIComponent(ref)}/content${q}`, {headers});
  if (!res.ok) throw new ApiError(await res.text(), res.status);
  const type = res.headers.get("Content-Type") ?? "";
  if (!/^(text\/|application\/(json|xml|javascript))/.test(type)) return null;
  const text = await res.text();
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n… (tronqué)` : text;
}

/**
 * Met la copie à jour depuis la base : l’API exige le contenu, on relit donc la version
 * courante de la ressource de base puis on la ré-enregistre sous le même slug (`from` garde la ref).
 */
export async function updateResourceFromBase(r: ResourceSummary): Promise<void> {
  if (!r.base) throw new Error("Cette ressource ne vient pas de la base.");
  const content = await getResourceContent(r.base.ref, undefined, Number.MAX_SAFE_INTEGER);
  if (content === null) throw new Error("Contenu binaire : mise à jour non prise en charge ici.");
  await apiFetch("/resources", {
    method: "POST",
    body: JSON.stringify({
      kind: r.kind,
      name: r.name,
      slug: r.slug,
      description: r.description ?? undefined,
      tags: r.tags,
      prompt: r.prompt ?? undefined,
      from: r.base.ref,
      content,
    }),
  });
}

export type ResourceUpdate = {
  file: string;
  ref: string;
  usedVersion: number;
  latestVersion: number | null;
  updateAvailable: boolean;
  /** Le fichier a été modifié dans l’artefact depuis la copie. */
  modified: boolean;
  /** La ressource d’origine n’existe plus. */
  missing: boolean;
};

/** Ressources copiées dans un artefact et état de mise à jour (propriétaire seulement). */
export async function listResourceUpdates(slug: string): Promise<ResourceUpdate[]> {
  const data = await apiFetch<{member?: ResourceUpdate[]}>(`/artifacts/${encodeURIComponent(slug)}/resource-updates`);
  return data.member ?? [];
}

export async function applyResourceUpdates(
  slug: string,
  opts: {files?: string[]; force?: boolean} = {},
): Promise<{updated: string[]; skipped: {file: string; reason: string}[]}> {
  return apiFetch(`/artifacts/${encodeURIComponent(slug)}/resource-updates`, {
    method: "POST",
    body: JSON.stringify(opts),
  });
}

export async function deleteResource(slug: string): Promise<void> {
  await apiFetch(`/resources/${encodeURIComponent(slug)}`, {method: "DELETE"});
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
  const params = new URLSearchParams();
  if (linkToken) params.set("k", linkToken);
  // Brouillon : ?draft=1 dans l'URL de la page (l'API ne le sert qu'aux membres du jeu).
  if (typeof location !== "undefined" && new URLSearchParams(location.search).get("draft") === "1") params.set("draft", "1");
  const q = params.toString() ? `?${params}` : "";
  return apiFetch<PublicArtifact>(`/public/artifacts/${encodeURIComponent(slug)}${q}`);
}

export async function fetchPublicCollection(
  slug: string,
  collection: string,
  linkToken?: string | null,
  readKey?: string | null,
  query?: {sort?: string; limit?: number},
): Promise<unknown[]> {
  const params = new URLSearchParams();
  if (linkToken) params.set("k", linkToken);
  if (readKey) params.set("rk", readKey);
  // Tri / limite faits par le serveur (sources.<x>.sort / limit) : classement sans tout télécharger.
  if (query?.sort) params.set("sort", query.sort);
  if (query?.limit && query.limit > 0) params.set("limit", String(Math.floor(query.limit)));
  const q = params.toString() ? `?${params}` : "";
  const data = await apiFetch<{member?: unknown[]}>(
    `/public/artifacts/${encodeURIComponent(slug)}/collections/${encodeURIComponent(collection)}${q}`,
  );
  return data.member ?? [];
}

/**
 * Lit un fichier JSON stocké comme asset de l'artefact (`data.sources.<x> = {asset}`).
 * Le jeton de session n'est joint que vers l'hôte de l'API : l'URL reçue du document n'est jamais
 * une raison d'envoyer le jeton ailleurs.
 */
export async function fetchAssetJson(url: string): Promise<unknown> {
  const acc = loadArtifactsAccount();
  const headers = new Headers({Accept: "application/json"});
  try {
    const apiOrigin = new URL(`${normalizeApiBase(loadApiBaseUrl())}/`, location.href).origin;
    if (acc?.token && new URL(url, location.href).origin === apiOrigin) {
      headers.set("Authorization", `Bearer ${acc.token}`);
    }
  } catch {
    /* URL illisible : requête sans jeton */
  }
  const res = await fetch(url, {headers});
  if (!res.ok) throw new ApiError((await res.text()) || `HTTP ${res.status}`, res.status);
  return res.json();
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
  const headers = new Headers({Accept: "application/json", "Content-Type": "application/json"});
  // Membre connecté (artefact ouvert sans `?k=`) : le jeton n'est joint que vers l'hôte de l'API.
  const acc = loadArtifactsAccount();
  try {
    if (acc?.token && new URL(getApiRoot(acc), location.href).origin === new URL(base, location.href).origin) {
      headers.set("Authorization", `Bearer ${acc.token}`);
    }
  } catch {
    /* URL illisible : envoi anonyme */
  }
  const res = await fetch(
    `${base}/public/artifacts/${encodeURIComponent(slug)}/collections/${encodeURIComponent(collection)}/records${q}`,
    {
      method: "POST",
      headers,
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
