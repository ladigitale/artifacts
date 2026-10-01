/**
 * Charge les libs whitelistées (scriptAssets résolus par l’API).
 * URLs jsDelivr uniquement — jamais d’URL libre depuis le document.
 */
const CDN_PREFIX = "https://cdn.jsdelivr.net/";

export type ScriptAsset = {
  id: string;
  src: string;
  integrity?: string;
  css?: string[];
  global?: string;
};

const loadedCss = new Set<string>();
const loadedScripts = new Map<string, Promise<void>>();

function assertCdn(url: string): void {
  if (!url.startsWith(CDN_PREFIX)) {
    throw new Error(`CDN non autorisé: ${url}`);
  }
}

function alreadyHasStylesheet(href: string): boolean {
  return (
    loadedCss.has(href) ||
    [...document.querySelectorAll("link[data-artifact-css]")].some(
      (el) => (el as HTMLLinkElement).dataset.artifactCss === href,
    )
  );
}

function alreadyHasScript(src: string): boolean {
  return [...document.querySelectorAll("script[data-artifact-script]")].some(
    (el) => (el as HTMLScriptElement).dataset.artifactScript === src,
  );
}

function loadCss(href: string): void {
  assertCdn(href);
  if (alreadyHasStylesheet(href)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.artifactCss = href;
  document.head.appendChild(link);
  loadedCss.add(href);
}

function loadScript(asset: ScriptAsset): Promise<void> {
  assertCdn(asset.src);
  const existing = loadedScripts.get(asset.src);
  if (existing) return existing;

  const p = new Promise<void>((resolve, reject) => {
    if (alreadyHasScript(asset.src)) {
      resolve();
      return;
    }
    const el = document.createElement("script");
    el.src = asset.src;
    el.async = false;
    el.dataset.artifactScript = asset.src;
    if (asset.integrity) {
      el.integrity = asset.integrity;
      el.crossOrigin = "anonymous";
    }
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Échec chargement script ${asset.id}`));
    document.head.appendChild(el);
  });
  loadedScripts.set(asset.src, p);
  return p;
}

/** Charge CSS puis JS dans l’ordre (dépendances déjà expansées côté API). */
export async function loadScriptAssets(assets: ScriptAsset[] | undefined | null): Promise<void> {
  if (!assets?.length) return;
  for (const asset of assets) {
    for (const href of asset.css ?? []) {
      loadCss(href);
    }
  }
  for (const asset of assets) {
    await loadScript(asset);
  }
}
