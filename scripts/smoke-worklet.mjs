/**
 * Smoke test de la phase 6 de creative-stack (modules AudioWorklet, granulaire) dans le viewer.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-media.mjs
 *
 * Sert dist/ avec la CSP et la Permissions-Policy de prod + une fausse API publique
 * (tests/fixtures/nuage.json ; le clip d'exemple jsDelivr est servi par Playwright).
 * Vérifie : processeurs AudioWorklet chargés depuis le viewer lui-même (script-src 'self'),
 * grains sur le clip puis sur une prise micro, fold / ladder pilotés par le store,
 * basse synth/acid au séquenceur, aucune erreur JS / CSP.
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
  nuage: fx("nuage.json"),
};
const CLIP = path.join(ROOT, "tests/fixtures/clip.webm");
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; media-src 'self' https: blob: data:; connect-src 'self' https: blob:; worker-src 'self' blob: https://cdn.jsdelivr.net; child-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const PERMISSIONS = "camera=(self), microphone=(self), midi=(self), display-capture=(self), geolocation=(), payment=(), usb=(), browsing-topics=()";

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
const level = async (p, id, ms = 800) => {
  let m = 0;
  for (let t = 0; t < ms; t += 50) { m = Math.max(m, (await state(p, id))?.rms ?? 0); await p.waitForTimeout(50); }
  return m;
};

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"]});
const page = await (await browser.newContext()).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused|Permissions policy|sonic-|worklet/i.test(m.text())) errors.push(m.text()); });
await page.route("https://cdn.jsdelivr.net/**/clip.webm", (route) => route.fulfill({status: 200, body: fs.readFileSync(CLIP), headers: {"Content-Type": "video/webm", "Access-Control-Allow-Origin": "*"}}));
await page.goto(`http://localhost:${PORT}/nuage?k=tok`);
await page.waitForTimeout(2500);
const btn = (a) => page.locator(`sonic-button[data-action="${a}"]`).click({timeout: 3000});

await page.locator("sonic-audio-unlock").locator("button").click({timeout: 3000}).catch(() => {});
await page.waitForTimeout(2000);
const grains = await state(page, "grains");
const ws = await page.evaluate(() => window.__creativeStackAudioEngine?.workletState);
check("processeurs AudioWorklet chargés depuis le viewer (script-src 'self')", ws === "ready", String(ws));
check("patch granulaire prêt, sans repli ni erreur de chargement", grains?.status === "ready" && grains.warnings.length === 0, JSON.stringify(grains?.warnings));
await btn("note-chord");
const lv1 = await level(page, "spectre");
check("grains sur le clip d'exemple", lv1 > 0.005 && (await state(page, "grains")).voices >= 3, `rms ${lv1}`);
for (const a of ["fold-plus", "fold-plus", "cut-minus", "dens-plus"]) await btn(a);
const st = await storeState(page, "nuage");
check("pli et filtre pilotés par le store", st.fold === 2 && st.cut < 2600 && st.dens === 36, JSON.stringify({fold: st.fold, cut: st.cut, dens: st.dens}));
await btn("rec"); await page.waitForTimeout(1500); await btn("rec"); await page.waitForTimeout(1000);
const take = await state(page, "rec");
check("prise micro (4 s max) → source « voix »", take?.takes === 1 && (await storeState(page, "nuage")).src === "voix", JSON.stringify(take?.last));
await page.waitForTimeout(600);
await btn("note-c4");
const lv2 = await level(page, "spectre");
// le micro factice ne bipe que par intermittence : on vérifie juste que la prise est jouée
check("grains sur la voix enregistrée", lv2 > 0.0002 && (await state(page, "grains")).voices >= 1, `rms ${lv2}`);
await btn("bass");
await page.waitForTimeout(1500);
const acid = await state(page, "acid");
check("basse synth/acid (ladder AudioWorklet) au séquenceur", acid?.played >= 3 && acid.warnings.length === 0, JSON.stringify({played: acid?.played, warnings: acid?.warnings}));
check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
