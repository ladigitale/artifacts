/**
 * Aperçu des ressources de la bibliothèque (page Ressources).
 *
 * - `loadPreview` lit le contenu d'une ressource une fois (cache par empreinte) et le range dans la forme
 *   qu'attend son rendu : source GLSL, modèle 3D (GLB), URL `blob:` d'une image ou d'un son, texte.
 * - `loadThumb` en tire la miniature d'une ligne de liste. Shaders et modèles 3D sont rendus par un seul
 *   `sonic-shader` / `sonic-3d` caché, l'un après l'autre : jamais plus d'un contexte WebGL pour toute la
 *   liste (le navigateur en accorde 8 à 16 par page), puis l'image est gardée en mémoire.
 */
import {getResourceBlob, type ResourceSummary} from "./cloud/client";
import {ensureAddonsFor} from "./addons";

export type ShaderParam = {index: number; label: string; min: number; max: number; value: number; step: number};

export type ResourcePreview =
  | {type: "shader"; source: string; params: ShaderParam[]; needsImage: boolean}
  | {type: "model"; asset: {kind: "glb"; glb?: string; blob?: Blob}}
  | {type: "image"; url: string}
  | {type: "audio"; url: string; blob: Blob}
  | {type: "text"; text: string; truncated: boolean}
  | {type: "none"};

export type ResourceThumb = {type: "image"; url: string} | {type: "wave"; peaks: number[]} | {type: "none"};

const MAX_TEXT = 20000;
const MAX_ENTRIES = 300;

/** Identifie un contenu : même clé = même aperçu, quelle que soit la fiche qui le décrit. */
export const previewKey = (r: ResourceSummary) => `${r.ref}@${r.sha256 || r.version}`;

/** Garde les N dernières entrées ; `drop` libère ce qu'une entrée évincée retient (URL `blob:`). */
function remember<T>(map: Map<string, T>, key: string, value: T, drop?: (v: T) => void): T {
  map.set(key, value);
  if (map.size > MAX_ENTRIES) {
    const [oldest, old] = map.entries().next().value as [string, T];
    map.delete(oldest);
    drop?.(old);
  }
  return value;
}

/** Au plus `n` tâches à la fois (lectures réseau des miniatures). */
function limiter(n: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= n) await new Promise<void>((go) => waiting.push(go));
    active++;
    try {
      return await task();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

const network = limiter(4);
const previews = new Map<string, Promise<ResourcePreview>>();

export function loadPreview(r: ResourceSummary): Promise<ResourcePreview> {
  const key = previewKey(r);
  const hit = previews.get(key);
  if (hit) return hit;
  const p = network(() => buildPreview(r));
  p.catch(() => previews.delete(key)); // nouvel essai à la prochaine demande
  return remember(previews, key, p, (old) => {
    void old.then((v) => (v.type === "image" || v.type === "audio") && URL.revokeObjectURL(v.url)).catch(() => {});
  });
}

function shaderParams(r: ResourceSummary): ShaderParam[] {
  if (!Array.isArray(r.params)) return [];
  const out: ShaderParam[] = [];
  for (const raw of r.params as Record<string, unknown>[]) {
    const index = Number(/(\d)$/.exec(String(raw?.name ?? raw?.uParam ?? raw?.id ?? ""))?.[1] ?? NaN);
    const min = Number(raw?.min);
    const max = Number(raw?.max);
    if (!(index >= 0 && index <= 3) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) continue;
    const value = Number.isFinite(Number(raw?.default)) ? Number(raw.default) : min;
    const whole = [min, max, value].every(Number.isInteger) && max - min >= 4;
    out.push({index, label: String(raw?.label ?? `uParam${index}`), min, max, value, step: whole ? 1 : (max - min) / 200});
  }
  return out;
}

const IMAGE_TYPES: [RegExp, string][] = [
  [/^\x89PNG/, "image/png"],
  [/^\xff\xd8\xff/, "image/jpeg"],
  [/^GIF8/, "image/gif"],
  [/^RIFF....WEBP/s, "image/webp"],
  [/^....ftypavi[fs]/s, "image/avif"],
  [/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/, "image/svg+xml"],
];
const AUDIO_TYPES: [RegExp, string][] = [
  [/^OggS/, "audio/ogg"],
  [/^RIFF....WAVE/s, "audio/wav"],
  [/^fLaC/, "audio/flac"],
  [/^(ID3|\xff[\xe2-\xfb])/, "audio/mpeg"],
];

/** Les ressources de base n'annoncent pas leur type : on le lit dans les premiers octets. */
async function sniff(blob: Blob, table: [RegExp, string][]): Promise<string> {
  const head = new Uint8Array(await blob.slice(0, 256).arrayBuffer());
  const text = String.fromCharCode(...head);
  return table.find(([re]) => re.test(text))?.[1] ?? "";
}

async function buildPreview(r: ResourceSummary): Promise<ResourcePreview> {
  const blob = await getResourceBlob(r.ref);
  if (r.kind === "shader") {
    const source = await blob.text();
    return {type: "shader", source, params: shaderParams(r), needsImage: /\biChannel0\b/.test(source)};
  }
  if (r.kind === "image") {
    const type = await sniff(blob, IMAGE_TYPES);
    // Dans un <img>, un SVG n'exécute aucun script et ne charge rien.
    return type ? {type: "image", url: URL.createObjectURL(new Blob([blob], {type}))} : {type: "none"};
  }
  if (r.kind === "audio") {
    const type = await sniff(blob, AUDIO_TYPES);
    const typed = new Blob([blob], {type: type || "audio/mpeg"});
    return {type: "audio", url: URL.createObjectURL(typed), blob: typed};
  }
  if (r.kind === "model3d") {
    const head = await blob.slice(0, 4).text();
    if (head === "glTF") return {type: "model", asset: {kind: "glb", blob}};
    const text = await blob.text();
    try {
      const env = JSON.parse(text) as {glb?: unknown};
      if (typeof env?.glb === "string" && env.glb) return {type: "model", asset: {kind: "glb", glb: env.glb}};
    } catch {
      /* pas du JSON : affiché en texte */
    }
    return asText(text);
  }
  // Données et le reste : du texte s'il y en a.
  const head = await blob.slice(0, 2048).text();
  return head.includes("\u0000") ? {type: "none"} : asText(await blob.text());
}

function asText(text: string): ResourcePreview {
  const truncated = text.length > MAX_TEXT;
  return {type: "text", text: truncated ? text.slice(0, MAX_TEXT) : text, truncated};
}

/** Nom du DataProvider des réglages de l'aperçu d'un shader (`param0`…`param3`). */
export const PREVIEW_PARAMS_DP = "resourcePreviewParams";

let testImage: Promise<string> | undefined;

/**
 * Image d'essai branchée sur `iChannel0` des shaders de traitement d'image : couleurs franches, dégradé,
 * bords nets et courbes, dessinés sur place (aucun fichier à servir).
 */
export function testImageUrl(): Promise<string> {
  return (testImage ??= new Promise<string>((resolve, reject) => {
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = 400;
    const g = c.getContext("2d");
    if (!g) return reject(new Error("canvas 2D indisponible"));
    const sky = g.createLinearGradient(0, 0, 0, 400);
    sky.addColorStop(0, "#1d3a8a");
    sky.addColorStop(0.55, "#f29e4c");
    sky.addColorStop(1, "#f7d9a3");
    g.fillStyle = sky;
    g.fillRect(0, 0, 640, 400);
    g.fillStyle = "#fff3c4";
    g.beginPath();
    g.arc(470, 150, 54, 0, Math.PI * 2);
    g.fill();
    const hills: [string, number, number][] = [["#2f6f5e", 250, 70], ["#1f4d45", 300, 50], ["#12302d", 345, 36]];
    for (const [color, base, amp] of hills) {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, 400);
      for (let x = 0; x <= 640; x += 8) g.lineTo(x, base - amp * Math.sin(x / 90 + base) * Math.cos(x / 37));
      g.lineTo(640, 400);
      g.fill();
    }
    const swatches = ["#e63946", "#f4a261", "#e9c46a", "#2a9d8f", "#3a86ff", "#8338ec"];
    swatches.forEach((color, i) => {
      g.fillStyle = color;
      g.fillRect(40 + i * 46, 40, 38, 38);
    });
    g.strokeStyle = "#ffffff";
    g.lineWidth = 6;
    g.strokeRect(60, 130, 150, 100);
    g.beginPath();
    g.arc(300, 180, 46, 0, Math.PI * 2);
    g.stroke();
    c.toBlob((b) => (b ? resolve(URL.createObjectURL(b)) : reject(new Error("image d'essai indisponible"))), "image/png");
  }));
}

/* ---------------------------------------------------------------- miniatures */

const THUMB_W = 192;
const THUMB_H = 128;
const thumbs = new Map<string, Promise<ResourceThumb>>();

export function loadThumb(r: ResourceSummary): Promise<ResourceThumb> {
  const key = previewKey(r);
  const hit = thumbs.get(key);
  if (hit) return hit;
  const p = buildThumb(r);
  p.catch(() => thumbs.delete(key));
  return remember(thumbs, key, p);
}

async function buildThumb(r: ResourceSummary): Promise<ResourceThumb> {
  const preview = await loadPreview(r);
  if (preview.type === "image") return {type: "image", url: preview.url};
  if (preview.type === "audio") return {type: "wave", peaks: await audioPeaks(preview.blob, 40)};
  if (preview.type === "shader") return {type: "image", url: await studio(() => shootShader(preview))};
  if (preview.type === "model") return {type: "image", url: await studio(() => shootModel(preview))};
  return {type: "none"};
}

/** Amplitude maximale par tranche, de 0 à 1 : la forme d'onde d'un son en `count` barres. */
export async function audioPeaks(blob: Blob, count: number): Promise<number[]> {
  const Offline = window.OfflineAudioContext ?? (window as unknown as {webkitOfflineAudioContext?: typeof OfflineAudioContext}).webkitOfflineAudioContext;
  if (!Offline) return [];
  const audio = await new Offline(1, 1, 44100).decodeAudioData(await blob.arrayBuffer());
  const data = audio.getChannelData(0);
  const size = Math.max(1, Math.floor(data.length / count));
  const stride = Math.max(1, Math.floor(size / 400)); // assez d'échantillons pour une barre
  const peaks: number[] = [];
  for (let i = 0; i < count; i++) {
    let max = 0;
    for (let j = i * size; j < Math.min(data.length, (i + 1) * size); j += stride) max = Math.max(max, Math.abs(data[j]));
    peaks.push(max);
  }
  const top = Math.max(...peaks, 0.001);
  return peaks.map((p) => Math.round((p / top) * 100) / 100);
}

/** Une seule prise de vue à la fois : un seul contexte WebGL pour les miniatures. */
let studioQueue: Promise<unknown> = Promise.resolve();
function studio<T>(job: () => Promise<T>): Promise<T> {
  const next = studioQueue.then(job, job);
  studioQueue = next.catch(() => {});
  return next;
}

type FrameSource = HTMLElement & {getFrameCanvas(): HTMLCanvasElement | null; frameSeq?: number};

/** Monte l'élément hors de vue (mais dans la fenêtre : les composants ne rendent pas hors écran), puis le retire. */
async function withStage<T extends HTMLElement, R>(el: T, shoot: (el: T) => Promise<R>): Promise<R> {
  const stage = document.createElement("div");
  stage.setAttribute("aria-hidden", "true");
  stage.style.cssText = `position:fixed;left:0;bottom:0;width:${THUMB_W}px;height:${THUMB_H}px;opacity:0;pointer-events:none;z-index:-1;overflow:hidden`;
  el.style.cssText = "display:block;width:100%;height:100%";
  stage.append(el);
  document.body.append(stage);
  try {
    return await shoot(el);
  } finally {
    stage.remove(); // le composant rend son contexte WebGL en se débranchant
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function waitEvent(el: HTMLElement, ok: string, accept: (e: Event) => boolean | Error, timeout: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const done = (err?: Error) => {
      clearTimeout(timer);
      el.removeEventListener(ok, onOk);
      el.removeEventListener("error", onError);
      err ? reject(err) : resolve();
    };
    const onOk = (e: Event) => {
      const verdict = accept(e);
      if (verdict instanceof Error) done(verdict);
      else if (verdict) done();
    };
    const onError = (e: Event) => done(new Error(String((e as CustomEvent).detail?.message ?? "rendu impossible")));
    const timer = setTimeout(() => done(new Error("rendu trop long")), timeout);
    el.addEventListener(ok, onOk);
    el.addEventListener("error", onError);
  });
}

function capture(el: FrameSource): string {
  const src = el.getFrameCanvas();
  if (!src || !src.width || !src.height) throw new Error("image non rendue");
  const c = document.createElement("canvas");
  c.width = THUMB_W;
  c.height = THUMB_H;
  const g = c.getContext("2d");
  if (!g) throw new Error("canvas 2D indisponible");
  g.drawImage(src, 0, 0, THUMB_W, THUMB_H);
  return c.toDataURL("image/webp", 0.82);
}

async function shootShader(p: Extract<ResourcePreview, {type: "shader"}>): Promise<string> {
  await ensureAddonsFor({tagName: "sonic-shader"});
  const el = document.createElement("sonic-shader") as FrameSource & Record<string, unknown>;
  el.mouse = false;
  el.dprMax = 1;
  el.releaseOffscreen = false;
  for (const param of p.params) el[`param${param.index}`] = param.value;
  if (p.needsImage) el.channel0 = await testImageUrl();
  el.image = p.source;
  return withStage(el, async () => {
    await waitEvent(
      el,
      "shader-state",
      (e) => {
        const s = (e as CustomEvent).detail as {status?: string; error?: string | null};
        return s?.status === "error" ? new Error(s.error ?? "shader invalide") : s?.status === "ready";
      },
      6000,
    );
    // Laisse l'image d'essai arriver et quelques images passer : un shader animé n'est pas figé à t = 0.
    const from = Number(el.frameSeq ?? 0);
    for (let i = 0; i < 30 && (i < 6 || Number(el.frameSeq ?? 0) <= from); i++) await sleep(50);
    return capture(el);
  });
}

async function shootModel(p: Extract<ResourcePreview, {type: "model"}>): Promise<string> {
  await ensureAddonsFor({tagName: "sonic-3d"});
  const el = document.createElement("sonic-3d") as FrameSource & Record<string, unknown>;
  el.dprMax = 1;
  el.releaseOffscreen = false;
  el.playOffscreen = true;
  el.gestures = "capture";
  el.asset = p.asset;
  return withStage(el, async () => {
    await waitEvent(el, "ready", () => true, 8000);
    await sleep(120);
    return capture(el);
  });
}
