/**
 * Smoke test de `sonic-segment-anything` (creative-stack, addon hugging-face-infer) dans le viewer, sous la CSP de production.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-segment-anything.mjs
 *
 * Transformers.js est remplacé au niveau réseau (même URL jsDelivr) par un module factice : le vrai worker « blob », le
 * registre (consentement, chargement), le protocole et le composant tournent ; seul le modèle est simulé (masque = disque
 * autour du premier point). Le vrai SAM 2 n'est pas exécuté ici.
 *
 * Vérifie : modèle configuré par le viewer, consentement demandé puis accepté via DataProvider, clic réel → encodage puis
 * masque (source d'images), Maj+clic sans ré-encodage, glissé = boîte, masque lu par sonic-mask-replace, aucune erreur CSP.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/segment-anything.json"), "utf8"));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; media-src 'self' https: blob: data:; connect-src http://localhost:4455 'self' https: blob:; worker-src 'self' blob: https://cdn.jsdelivr.net; child-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  if (/^\/api\/public\/artifacts\/([^/]+)/.test(u.pathname)) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    return r.end(JSON.stringify({id: "segment-anything", slug: "segment-anything", title: doc.title, description: "", visibility: "link", document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
  }
  let f = path.join(DIST, u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  const t = f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".svg") ? "image/svg+xml" : "text/html";
  r.writeHead(200, {"Content-Type": t, "Content-Security-Policy": CSP});
  r.end(fs.readFileSync(f));
}).listen(PORT);

let failures = 0;
const check = (label, ok, detail = "") => { console.log(`${ok ? "✔" : "✘"} ${label}${detail ? "  — " + detail : ""}`); if (!ok) failures++; };
const deepEval = (p, sel, fn, arg) => p.evaluate(([sel, fn, arg]) => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  const el = deep(document, sel)[0];
  return el ? new Function("el", `return (${fn})(el)`)(el) : null;
}, [sel, fn.toString(), arg]);


/** Module factice servi à la place de transformers.min.js (exécuté dans le worker). */
const FAKE_TRANSFORMERS = `
export const env = { backends: { onnx: { wasm: {} } }, version: "fake" };
export const LogLevel = {};
export async function pipeline() { throw new Error("pas de pipeline dans ce test"); }
export const ModelRegistry = {
  is_pipeline_cached: async () => false,
  get_pipeline_files: async () => ["onnx/vision_encoder_q4f16.onnx_data", "onnx/prompt_encoder_mask_decoder_fp16.onnx_data"],
  get_file_metadata: async (_m, f) => ({ exists: true, size: f.includes("vision") ? 28532736 : 10454016 }),
};
export class RawImage { constructor(data, width, height, channels) { this.data = data; this.width = width; this.height = height; this.channels = channels; } }
self.__calls = { encode: 0, decode: 0 };
export const AutoProcessor = { from_pretrained: async (repo, o) => {
  const ip = {
    reshape_input_points: (p, _o, _r, isBox) => ({ value: p[0][0], isBox: !!isBox }),
    add_input_labels: (l) => ({ value: l[0][0] }),
  };
  const proc = async (img) => ({ pixel_values: { dims: [1, 3, 1024, 1024] }, original_sizes: [[img.height, img.width]], reshaped_input_sizes: [[1024, 1024]], _img: img });
  proc.image_processor = ip;
  proc.post_process_masks = async (m, sizes) => [m];
  return proc;
} };
export const AutoModelForMaskGeneration = { from_pretrained: async (repo, o) => {
  console.log("fake-load " + JSON.stringify({ repo, revision: o.revision, dtype: o.dtype, device: o.device }));
  let size = null;
  const model = async (feed) => {
    self.__calls.decode++;
    const [h, w] = size;
    const data = new Uint8Array(3 * w * h);
    let cx = w / 2, cy = h / 2, r = Math.min(w, h) / 4, box = null;
    if (feed.input_points) { const p = feed.input_points.value.find((_, i) => feed.input_labels.value[i] === 1) || feed.input_points.value[0]; cx = p[0]; cy = p[1]; }
    if (feed.input_boxes) box = feed.input_boxes.value;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const inside = box ? (x >= box[0] && x < box[2] && y >= box[1] && y < box[3]) : (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r);
      if (inside) data[w * h + y * w + x] = 1;
    }
    return { pred_masks: { dims: [1, 3, h, w], data }, iou_scores: { data: new Float32Array([0.3, 0.88, 0.5]) } };
  };
  model.get_image_embeddings = async (inputs) => { self.__calls.encode++; size = inputs.original_sizes[0]; console.log("fake-encode"); return { "image_embeddings.0": {} }; };
  model.dispose = async () => {};
  return model;
} };
`;
const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"]});
const errors = [];
const workerMsgs = [];
const ctx = await browser.newContext({viewport: {width: 1000, height: 1000}});
let served = 0;
await ctx.route(/cdn\.jsdelivr\.net\/npm\/@huggingface\/transformers@4\.3\.0\/dist\/transformers\.min\.js/, (route) => {
  served++;
  route.fulfill({status: 200, contentType: "text/javascript", headers: {"Access-Control-Allow-Origin": "*"}, body: FAKE_TRANSFORMERS});
});
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused|sonic-|Worker/i.test(m.text())) errors.push(m.text()); });
page.on("worker", (w) => w.on("console", (m) => workerMsgs.push(m.text())));
await page.goto(`http://localhost:${PORT}/segment-anything?k=tok`);
await page.waitForTimeout(2000);

const st = () => deepEval(page, "sonic-segment-anything", (el) => JSON.parse(JSON.stringify(el.getState())));
const maskAt = (nx, ny) => deepEval(page, "sonic-segment-anything", (el) => {
  const c = el.getFrameCanvas();
  if (!c) return null;
  return {w: c.width, h: c.height, seq: el.frameSeq};
});
const alphaAt = (nx, ny) => page.evaluate(([nx, ny]) => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.tagName === "SONIC-SEGMENT-ANYTHING") a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  const c = deep(document)[0].getFrameCanvas();
  const x = Math.min(c.width - 1, Math.floor(nx * c.width)), y = Math.min(c.height - 1, Math.floor(ny * c.height));
  return c.getContext("2d").getImageData(x, y, 1, 1).data[3];
}, [nx, ny]);
const photoBox = () => deepEval(page, "#photo", (el) => { const r = el.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; });
const waitFor = async (pred, ms = 6000) => { const t0 = Date.now(); let s; while (Date.now() - t0 < ms) { s = await st(); if (s && pred(s)) return s; await page.waitForTimeout(100); } return s; };

let s = await st();
check("composant monté, modèle configuré par le viewer (pas d'erreur de configuration)", s && !s.error, JSON.stringify(s && s.error));
check("rien ne se télécharge avant la première invite", served === 0 && s.phase === "idle", JSON.stringify([served, s && s.phase]));
const b = await photoBox();
check("image affichée", b && b.w > 100, JSON.stringify(b));

// Clic réel au centre-gauche de l'image : consentement demandé (≈ 39 Mo > 20 Mo)
await page.mouse.click(b.x + b.w * 0.3, b.y + b.h * 0.5);
s = await waitFor((s) => s.phase === "awaiting-consent");
check("premier clic : consentement demandé, point enregistré", s.phase === "awaiting-consent" && s.points.length === 1 && Math.abs(s.points[0].x - 0.3) < 0.02, JSON.stringify({phase: s.phase, points: s.points}));
check("worker démarré (Transformers.js chargé sous la CSP)", served >= 1, String(served));

// Consentement (accept(), comme le ferait un bouton)
await page.evaluate(() => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.tagName === "SONIC-SEGMENT-ANYTHING") a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  deep(document)[0].accept();
});
s = await waitFor((s) => s.present === 1 && !s.busy);
check("après consentement : modèle prêt, image encodée, masque présent", s.phase === "ready" && s.encoded && s.present === 1, JSON.stringify({phase: s.phase, encoded: s.encoded, present: s.present, error: s.error}));
check("score et statistiques publiés", s.score === 0.88 && s.coverage > 0.15 && s.coverage < 0.25 && Math.abs(s.cx - 0.3) < 0.03, JSON.stringify({score: s.score, coverage: s.coverage, cx: s.cx}));
const m = await maskAt();
check("masque exposé comme source d'images", m && m.w > 0 && m.seq >= 1, JSON.stringify(m));
check("masque : opaque au point cliqué, transparent loin", (await alphaAt(0.3, 0.5)) === 255 && (await alphaAt(0.95, 0.05)) === 0);

const load = workerMsgs.find((t) => t.startsWith("fake-load "));
const lo = load ? JSON.parse(load.slice(10)) : null;
check("modèle chargé : dépôt, révision figée et dtype du raccourci", lo && lo.repo === "onnx-community/sam2.1-hiera-tiny-ONNX" && lo.revision === "814a066640debee5a91e70aa401fb8e17e030503" && lo.dtype.vision_encoder === "q8", load);

// Maj+clic : ajout d'un point, pas de ré-encodage
await page.keyboard.down("Shift");
await page.mouse.click(b.x + b.w * 0.7, b.y + b.h * 0.5);
await page.keyboard.up("Shift");
s = await waitFor((s) => s.points.length === 2 && !s.busy);
check("Maj+clic : pas de ré-encodage de la même image", workerMsgs.filter((t) => t === "fake-encode").length === 1, String(workerMsgs.filter((t) => t === "fake-encode").length));
check("Maj+clic : deux points sur l'objet", s.points.length === 2 && s.points.every((p) => p.label === 1), JSON.stringify(s.points));

// Alt+clic : exclusion
await page.keyboard.down("Alt");
await page.mouse.click(b.x + b.w * 0.1, b.y + b.h * 0.1);
await page.keyboard.up("Alt");
s = await waitFor((s) => s.points.length === 3 && !s.busy);
check("Alt+clic : point hors de l'objet", s.points[2] && s.points[2].label === 0, JSON.stringify(s.points));

// Glissé : boîte
await page.mouse.move(b.x + b.w * 0.6, b.y + b.h * 0.6);
await page.mouse.down();
await page.mouse.move(b.x + b.w * 0.9, b.y + b.h * 0.9, {steps: 5});
await page.mouse.up();
s = await waitFor((s) => s.box && !s.busy);
check("glissé : boîte, points effacés", s.box && s.points.length === 0 && Math.abs(s.box.x0 - 0.6) < 0.02 && Math.abs(s.box.x1 - 0.9) < 0.02, JSON.stringify(s.box));
check("boîte : masque = la boîte", (await alphaAt(0.75, 0.75)) === 255 && (await alphaAt(0.3, 0.5)) === 0 && Math.abs(s.coverage - 0.09) < 0.02, String(s.coverage));

// Le masque est consommé par sonic-mask-replace
const mr = await deepEval(page, "#rendu", (el) => { const c = el.getFrameCanvas ? el.getFrameCanvas() : null; return c ? {w: c.width, h: c.height} : null; });
check("sonic-mask-replace produit une image à partir du masque", mr && mr.w > 0, JSON.stringify(mr));

await page.screenshot({path: "/tmp/smoke-segment-anything.png"});
check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 500));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
