/**
 * Smoke test de `sonic-vectorize` (creative-stack, addon vectorize) : image → chemins SVG.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-vectorize.mjs
 *
 * Sert dist/ avec la CSP de prod + une fausse API publique (tests/fixtures/vectorize.json).
 * Vérifie : addon chargé à la demande, image lue puis vectorisée, couches et SVG publiés, dessin rendu,
 * aucune erreur JS / CSP.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/vectorize.json"), "utf8"));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; connect-src 'self' http://localhost:4455 https:; object-src 'none'; base-uri 'self'";

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  if (/^\/api\/public\/artifacts\/([^/]+)/.test(u.pathname)) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    return r.end(JSON.stringify({id: "vectorize", slug: "vectorize", title: doc.title, description: "", visibility: "link", document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
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
  window.__v = null;
  document.addEventListener("vectorize-state", (e) => { if (e.detail.status === "ready" || e.detail.status === "error") window.__v = e.detail; });
});
await page.goto(`http://localhost:${PORT}/vectorize?k=tok`);
await page.waitForFunction(() => window.__v, null, {timeout: 8000}).catch(() => {});
const st = await page.evaluate(() => window.__v);
check("vectorisation terminée sans erreur", st?.status === "ready", JSON.stringify(st?.error));
check("trois couches (fond, disque, bande)", st?.layers === 3, String(st?.layers));
check("palette de trois couleurs", st?.palette?.length === 3, JSON.stringify(st?.palette));
check("SVG autonome publié", /^<svg[^>]*viewBox="0 0 64 64"/.test(st?.svg ?? "") && (st?.svg.match(/<path/g) ?? []).length === 3);
check("courbes de Bézier dans le disque", /C/.test(st?.svg ?? ""));
const drawn = await page.evaluate(() => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.tagName === "SONIC-VECTORIZE") a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  const el = deep(document)[0];
  return el ? el.shadowRoot.querySelectorAll("svg path").length : -1;
});
check("le dessin est rendu dans la page", drawn === 3, String(drawn));
await page.screenshot({path: "/tmp/smoke-vectorize.png"});
check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 400));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
