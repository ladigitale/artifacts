/**
 * Smoke test de la phase 7 de creative-stack (physique planck.js, manettes) dans le viewer.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-media.mjs
 *
 * Sert dist/ avec la CSP et la Permissions-Policy de prod + une fausse API publique
 * (tests/fixtures/casse-briques.json). Manette factice (API Gamepad). Vérifie : monde
 * construit (briques en liste DP), raquette au clavier puis au stick, lancer, chocs
 * dans le store (score, brique retirée, vibration), shader abonné à #world, aucune
 * erreur JS / CSP.
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
  "casse-briques": fx("casse-briques.json"),
};
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

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"]});
const page = await (await browser.newContext({viewport: {width: 900, height: 900}})).newPage();
await page.addInitScript(() => {
  const pad = {index: 0, id: "Pad (STANDARD GAMEPAD)", mapping: "standard", connected: true, axes: [0, 0, 0, 0], buttons: Array.from({length: 17}, () => ({pressed: false, value: 0})), vibrationActuator: {playEffect: async () => { window.__rumbles = (window.__rumbles ?? 0) + 1; }}};
  window.__pad = pad;
  navigator.getGamepads = () => [pad];
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused|Permissions policy|sonic-/i.test(m.text())) errors.push(m.text()); });
await page.goto(`http://localhost:${PORT}/casse-briques?k=tok`);
await page.waitForTimeout(2500);

let w = await state(page, "world");
check("monde construit : 50 briques (liste du store) + raquette + balle", w?.count === 52 && w.errors.length === 0, JSON.stringify({count: w?.count, errors: w?.errors}));
await page.keyboard.down("ArrowLeft");
await page.waitForTimeout(400);
await page.keyboard.up("ArrowLeft");
await page.waitForTimeout(100);
w = await state(page, "world");
check("raquette au clavier (← tenu puis relâché)", w.bodies.paddle.x < 330 && (await storeState(page, "jeu")).input.paddle.vx === 0, String(w.bodies.paddle.x));
await page.evaluate(() => { window.__pad.axes = [0.9, 0, 0, 0]; });
await page.waitForTimeout(400);
await page.evaluate(() => { window.__pad.axes = [0, 0, 0, 0]; });
await page.waitForTimeout(200);
const afterStick = (await state(page, "world")).bodies.paddle.x;
check("raquette au stick de la manette", afterStick > w.bodies.paddle.x + 100, `${w.bodies.paddle.x} → ${afterStick}`);
await page.evaluate(() => { window.__pad.buttons[0] = {pressed: true, value: 1}; });
await page.waitForTimeout(120);
await page.evaluate(() => { window.__pad.buttons[0] = {pressed: false, value: 0}; });
await page.waitForTimeout(150);
check("lancer au bouton A", (await storeState(page, "jeu")).state === "en jeu");
let jeu = null;
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(150);
  jeu = await storeState(page, "jeu");
  if (jeu.score > 0) break;
}
w = await state(page, "world");
check("chocs dans le store : brique retirée, score", jeu.score > 0 && jeu.bricks.length < 50 && w.count === 2 + jeu.bricks.length, JSON.stringify({score: jeu.score, bricks: jeu.bricks.length, count: w.count, lastError: jeu.lastError}));
check("vibration à chaque brique", (await page.evaluate(() => window.__rumbles ?? 0)) >= 1);
const consumers = await page.evaluate(() => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  const el = deep(document, "#world")[0];
  return { consumers: el.consumers.size, seq: el.frameSeq };
});
check("sonic-shader de Concorde abonné à #world", consumers.consumers >= 1 && consumers.seq > 20, JSON.stringify(consumers));
check("manette détectée (état)", (await state(page, "pad"))?.status === "ready");
check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
