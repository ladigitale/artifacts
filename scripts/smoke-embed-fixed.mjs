/**
 * Garde-fou : un artefact dont la racine est en `position:fixed;inset:0` (jeu plein écran)
 * reste dans son cadre quand il est intégré sur un site tiers ; il ne recouvre pas la page hôte.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : CHROME_PATH=…/chrome node scripts/smoke-embed-fixed.mjs
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const API_PORT = 4455;
const HOST_PORT = 4466;
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/plein-cadre.json"), "utf8"));
const types = {".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".html": "text/html"};

const api = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  const cors = {"Access-Control-Allow-Origin": "*"};
  if (/^\/api\/public\/artifacts\/[a-z0-9-]+/.test(u.pathname)) {
    r.writeHead(200, {"Content-Type": "application/json", ...cors});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    return r.end(JSON.stringify({id: "p", slug: "plein-cadre", title: doc.title, description: "", visibility: "public", document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
  }
  let f = path.join(DIST, u.pathname);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  r.writeHead(200, {"Content-Type": types[path.extname(f)] ?? "text/html", ...cors});
  r.end(fs.readFileSync(f));
}).listen(API_PORT);

const HOST_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Site tiers</title></head><body style="margin:0">
<h1 id="titre" style="margin:0;height:120px">Mon blog</h1>
<script src="http://localhost:${API_PORT}/embed.js" data-artifact="plein-cadre" data-height="300px"></script>
<p id="suite" style="height:400px">La suite de l'article.</p>
</body></html>`;
const host = http.createServer((q, r) => { r.writeHead(200, {"Content-Type": "text/html"}); r.end(HOST_PAGE); }).listen(HOST_PORT);

let failures = 0;
const check = (label, ok, detail = "") => { console.log(`${ok ? "✔" : "✘"} ${label}${detail ? "  — " + detail : ""}`); if (!ok) failures++; };
const rectOf = (p, sel) => p.evaluate((sel) => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  const el = deep(document, sel)[0];
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return {top: Math.round(b.top), left: Math.round(b.left), width: Math.round(b.width), height: Math.round(b.height)};
}, sel);

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"]});
const page = await (await browser.newContext({viewport: {width: 900, height: 700}})).newPage();

await page.goto(`http://localhost:${HOST_PORT}/`);
await page.waitForTimeout(2500);
const frame = await rectOf(page, "artifact-embed");
const fixed = await rectOf(page, "#plein");
check("intégré : le cadre fait 300 px sous le titre", frame?.top === 120 && frame?.height === 300, JSON.stringify(frame));
check("intégré : l'élément fixe reste dans le cadre", !!fixed && !!frame && fixed.top >= frame.top && fixed.height <= frame.height && fixed.width <= frame.width, JSON.stringify(fixed));
const covered = await page.evaluate(() => document.elementFromPoint(40, 40)?.id);
check("intégré : le titre de la page hôte n'est pas recouvert", covered === "titre", String(covered));

// Sur sa propre page, l'artefact occupe bien tout l'écran.
await page.goto(`http://localhost:${API_PORT}/plein-cadre`);
await page.waitForTimeout(2000);
const full = await rectOf(page, "#plein");
check("page de l'artefact : plein écran conservé", full?.top === 0 && full?.width === 900 && full?.height === 700, JSON.stringify(full));

await browser.close();
api.close();
host.close();
process.exit(failures ? 1 : 0);
