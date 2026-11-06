/**
 * Smoke test des outils vectoriels `sonic-vector-op` / `sonic-vector-library` (creative-stack, addon vector).
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-vector.mjs
 *
 * Sert dist/ avec la CSP de prod + une fausse API publique (tests/fixtures/vector.json).
 * Vérifie : addon chargé à la demande, booléens (intersection, trou), décalage, commandes de la
 * bibliothèque, aucune erreur JS / CSP.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/vector.json"), "utf8"));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; connect-src 'self' http://localhost:4455 https:; object-src 'none'; base-uri 'self'";

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  if (/^\/api\/public\/artifacts\/([^/]+)/.test(u.pathname)) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    return r.end(JSON.stringify({id: "vector", slug: "vector", title: doc.title, description: "", visibility: "link", document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
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

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"]});
const errors = [];
const page = await (await browser.newContext({viewport: {width: 900, height: 1400}})).newPage();
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused|sonic-/i.test(m.text())) errors.push(m.text()); });
await page.addInitScript(() => {
  window.__v = {};
  document.addEventListener("vector-result", (e) => { const t = e.composedPath()[0]; window.__v[t.id] = e.detail; });
});
await page.goto(`http://localhost:${PORT}/vector?k=tok`);
await page.waitForTimeout(2500);

const res = await page.evaluate(() => window.__v);
check("intersection : aire 25", Math.abs((res.inter?.area ?? -1) - 25) < 0.01, JSON.stringify(res.inter?.area));
check("différence : un polygone à trou, aire 800", res.trou?.polygons === 1 && Math.abs(res.trou.area - 800) < 0.01, JSON.stringify(res.trou?.area));
check("décalage : aire supérieure à 100", (res.gros?.area ?? 0) > 100, JSON.stringify(res.gros?.area));
check("aucune erreur de calcul", Object.values(res).every((r) => r.error === null));

const lib = await page.evaluate(async () => {
  await customElements.whenDefined("sonic-vector-library");
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.id === "biblio") a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  const el = deep(document)[0];
  el.command({n: 0});
  el.command({n: 1, add: {name: "Carré", d: "M0 0 H10 V10 H0 Z", tags: ["base"]}});
  const a = el.library.size;
  el.command({n: 2, add: {name: "Mauvais", d: "???"}});
  return {a, b: el.library.size};
});
check("bibliothèque : ajout accepté, forme invalide refusée", lib.a === 1 && lib.b === 1, JSON.stringify(lib));
check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 400));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
