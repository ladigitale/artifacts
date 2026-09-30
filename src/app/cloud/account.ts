export type ArtifactsAccount = {
  apiBaseUrl: string;
  token: string;
  user?: {
    id?: string;
    email?: string;
    activeDatasetId?: string;
    themeId?: string;
  };
};

const STORAGE_KEY = "artifacts-account";

export function loadArtifactsAccount(): ArtifactsAccount | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ArtifactsAccount;
    if (!parsed?.apiBaseUrl || !parsed?.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveArtifactsAccount(account: ArtifactsAccount): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
}

export function clearArtifactsAccount(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getApiRoot(account: ArtifactsAccount): string {
  const base = account.apiBaseUrl.replace(/\/$/, "");
  return base.endsWith("/api") ? base : `${base}/api`;
}
