/**
 * Smoke test de la phase 4 de creative-stack (enregistrement, export, téléchargement) dans le viewer.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-media.mjs
 *
 * Sert dist/ avec la CSP et la Permissions-Policy de prod + une fausse API publique
 * (tests/fixtures/sampler-de-poche.json). Chromium avec micro factice. Vérifie : micro au
 * clic, patch d'effets sur le micro (sonic-audio-input), prises sur deux pads, sampler qui
 * les rejoue (main + séquenceur), export vidéo du shader avec le son, téléchargement du
 * fichier (WebM avec durée), aucune erreur JS / CSP.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const fx = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures", f), "utf8"));
const fixtures = {
  "sampler-de-poche": fx("sampler-de-poche.json"),
};
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; media-src 'self' https: blob: data:; connect-src 'self' https: blob:; worker-src 'self' blob: https://cdn.jsdelivr.net; child-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const PERMISSIONS = "camera=(self), microphone=(self), geolocation=(), payment=()";

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  const m = /^\/api\/public\/artifacts\/([^/]+)/.exec(u.pathname);
  if (m) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    const doc = fixtures[m[1]];
    return r.end(JSON.stringify({id: m[1], slug: m[1], title: doc.title, description: "", visibility: "link",
      document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
  }
  let f = path.join(DIST, u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  const t = f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".svg") ? "image/svg+xml" : "text/html";
  r.writeHead(200, {"Content-Type": t, "Content-Security-Policy": CSP, "Permissions-Policy": PERMISSIONS});
  r.end(fs.readFileSync(f));
}).listen(PORT);

let failures = 0;
const check = (label, ok, detail = "") => { console.log(`${ok ? "✔" : "✘"} ${label}${detail ? "  — " + detail : ""}`); if (!ok) failures++; };
const state = (p, id) => p.evaluate((id) => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  const el = deep(document, `#${id}`)[0];
  return el && typeof el.getState === "function" ? JSON.parse(JSON.stringify(el.getState())) : null;
}, id);
const storeState = (p, id) => p.evaluate((id) => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  const el = deep(document, `sonic-store#${id}`)[0];
  return el?.state ? JSON.parse(JSON.stringify(el.state)) : null;
}, id);

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"]});
const ctx = await browser.newContext({acceptDownloads: true});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused|Permissions policy|sonic-/i.test(m.text())) errors.push(m.text()); });
let gum = 0;
await page.exposeFunction("__gum", () => gum++);
await page.addInitScript(() => {
  const md = navigator.mediaDevices;
  if (md) { const orig = md.getUserMedia.bind(md); md.getUserMedia = (c) => { window.__gum(); return orig(c); }; }
});
await page.goto(`http://localhost:${PORT}/sampler-de-poche?k=tok`);
await page.waitForTimeout(2500);
const btn = (a) => page.locator(`sonic-button[data-action="${a}"]`).click({timeout: 3000});

check("aucune demande d'accès au chargement", gum === 0);
check("enregistreur en attente du micro", (await state(page, "rec"))?.status === "waiting-source", JSON.stringify(await state(page, "rec")));
await page.locator("sonic-audio-unlock").locator("button").click({timeout: 3000});
await page.waitForTimeout(1500);
const mic = await state(page, "mic");
const clean = await state(page, "clean");
check("micro et son activés au clic", mic?.status === "ready" && gum >= 1, JSON.stringify(mic?.status));
check("patch d'effets branché sur le micro (sonic-audio-input)", clean?.status === "ready" && clean.inputs?.voix === true, JSON.stringify(clean));

for (const k of ["A", "B"]) {
  await btn(`arm-${k}`); await page.waitForTimeout(150);
  await btn("rec"); await page.waitForTimeout(1100); await btn("rec");
  await page.waitForTimeout(700);
}
const rec = await state(page, "rec");
check("deux prises enregistrées", rec?.takes === 2 && rec.last?.url?.startsWith("blob:") && rec.last.durS > 0.8, JSON.stringify(rec?.last));
await page.waitForTimeout(400);
let pads = await state(page, "pads");
check("sampler : 2 pads chargés, 2 vides, prêt", pads?.loaded === 2 && pads.empty.join() === "C,D" && pads.status === "ready", JSON.stringify(pads));
await btn("hit-A"); await page.waitForTimeout(200);
await btn("play"); await page.waitForTimeout(1200);
pads = await state(page, "pads");
check("pads joués à la main et par le séquenceur", pads.played >= 3, `played=${pads.played}`);

await btn("export"); await page.waitForTimeout(2500); await btn("export");
await page.waitForTimeout(1200);
const ex = await state(page, "export");
check("export vidéo (shader + son)", ex?.takes === 1 && /^video\//.test(ex.last?.mime) && Math.abs(ex.last.durS - 2.5) < 0.4 && ex.last.width > 0, JSON.stringify(ex?.last));
const [dl] = await Promise.all([
  page.waitForEvent("download", {timeout: 5000}),
  page.locator('sonic-media-download[filename="sampler-de-poche"]').locator("a").click({timeout: 3000}),
]);
const file = await dl.path();
const bytes = fs.readFileSync(file);
const hasDuration = bytes.subarray(0, 4096).includes(Buffer.from([0x44, 0x89, 0x88]));
check("téléchargement du fichier", /^sampler-de-poche\.(webm|mp4)$/.test(dl.suggestedFilename()) && bytes.length === ex.last.size, `${dl.suggestedFilename()} ${bytes.length} o`);
check("WebM avec durée", !dl.suggestedFilename().endsWith(".webm") || hasDuration);
check("store cohérent", (await storeState(page, "poche"))?.armed === "B");

check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
