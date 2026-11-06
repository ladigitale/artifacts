/**
 * Smoke test de `fontFiles` (polices .woff2 fournies en assets) dans le viewer.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-font-files.mjs
 *
 * Vérifie : la police est ajoutée et chargée, appliquée dans le shadow DOM, plage de graisse conservée, référence non résolue ignorée.
 * Le serveur du smoke sert l'asset et résout `@asset:` comme l'API ; police : FONT_FILE (défaut : une police de Concorde).
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const FONT_FILE = process.env.FONT_FILE || path.join(ROOT, "node_modules/@supersoniks/concorde/public/fonts/ClashGrotesk-Medium.woff2");
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/font-files.json"), "utf8"));
doc.fontFiles[0].src = `http://localhost:${4455}/api/public/artifacts/font-files/assets/titre.woff2?v=abcdef123456`;
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; connect-src 'self' http://localhost:4455 https:; object-src 'none'; base-uri 'self'";

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  if (/\/assets\/titre\.woff2$/.test(u.pathname)) {
    r.writeHead(200, {"Content-Type": "font/woff2", "Access-Control-Allow-Origin": "*"});
    return r.end(fs.readFileSync(FONT_FILE));
  }
  if (/^\/api\/public\/artifacts\/([^/]+)/.test(u.pathname)) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    return r.end(JSON.stringify({id: "scroll", slug: "scroll", title: doc.title, description: "", visibility: "link", document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
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
const page = await (await browser.newContext({viewport: {width: 900, height: 600}})).newPage();
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused/i.test(m.text())) errors.push(m.text()); });
await page.goto(`http://localhost:${PORT}/font-files?k=tok`);
await page.waitForTimeout(2500);
const info = await page.evaluate(async () => {
  await document.fonts.ready;
  const faces = [...document.fonts].map((f) => ({family: f.family.replace(/"/g, ""), status: f.status, weight: f.weight, style: f.style}));
  const deep = (r, id, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.id === id) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, id, a); }); return a; };
  const width = (id) => { const e = deep(document, id)[0]; if (!e) return null; const range = document.createRange(); range.selectNodeContents(e); return Math.round(range.getBoundingClientRect().width); };
  return {faces, titre: width("titre"), repli: width("repli"), computed: getComputedStyle(deep(document, "titre")[0]).fontFamily};
});
const mine = info.faces.find((f) => f.family === "Mon Titre");
check("police ajoutée et chargée", mine && mine.status === "loaded", JSON.stringify(mine));
check("plage de graisse conservée (police variable)", mine && mine.weight === "100 900", JSON.stringify(mine));
check("référence @asset: non résolue ignorée", !info.faces.some((f) => f.family === "Absente"), JSON.stringify(info.faces.map((f) => f.family)));
check("le titre utilise la police fournie (largeur différente du repli)", info.titre && info.repli && info.titre !== info.repli, JSON.stringify([info.titre, info.repli]));
await page.screenshot({path: "/tmp/smoke-font-files.png"});
check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 400));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
