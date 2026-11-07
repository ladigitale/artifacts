/**
 * Smoke test de `sonic-blobs` (creative-stack, addon blobs) : compter des objets dans une image.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-blobs.mjs
 *
 * Sert dist/ avec la CSP de prod + une fausse API publique (tests/fixtures/blobs.json : 7 disques,
 * dont deux qui se touchent). Vérifie : addon chargé à la demande, image comptée (7 objets, 2 issus
 * d'une séparation), état et marqueurs publiés, aperçu rendu, valeur affichée, aucune erreur JS / CSP.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/blobs.json"), "utf8"));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; connect-src 'self' http://localhost:4455 https:; object-src 'none'; base-uri 'self'";

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  if (/^\/api\/public\/artifacts\/([^/]+)/.test(u.pathname)) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    return r.end(JSON.stringify({id: "blobs", slug: "blobs", title: doc.title, description: "", visibility: "link", document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
  }
  let f = path.join(DIST, u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  const t = f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".svg") ? "image/svg+xml" : "text/html";
  r.writeHead(200, {"Content-Type": t, "Content-Security-Policy": CSP});
  r.end(fs.readFileSync(f));
}).listen(PORT);

let failures = 0;
const check = (label, ok, detail = "") => { console.log(`${ok ? "✔" : "✘"} ${label}${detail ? "  — " + detail : ""}`); if (!ok) failures++; };

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"]});
const errors = [];
const page = await (await browser.newContext({viewport: {width: 900, height: 900}})).newPage();
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused|sonic-/i.test(m.text())) errors.push(m.text()); });
await page.addInitScript(() => {
  window.__b = null;
  document.addEventListener("blobs-state", (e) => { if (e.detail.status === "ready" || e.detail.status === "error") window.__b = e.detail; });
});
await page.goto(`http://localhost:${PORT}/blobs?k=tok`);
await page.waitForFunction(() => window.__b, null, {timeout: 8000}).catch(() => {});
const st = await page.evaluate(() => window.__b);
check("comptage terminé sans erreur", st?.status === "ready", JSON.stringify(st?.error));
check("7 objets comptés", st?.count === 7, String(st?.count));
check("deux objets issus d'une séparation", st?.blobs?.filter((b) => b.split).length === 2, JSON.stringify(st?.blobs?.map((b) => b.split)));
check("objets sombres détectés", st?.polarity === "dark", String(st?.polarity));
check("coordonnées normalisées publiées", st?.blobs?.every((b) => b.nx > 0 && b.nx < 1 && b.ny > 0 && b.ny < 1));
check("marqueurs SVG publiés", /^data:image\/svg\+xml/.test(st?.overlay?.url ?? "") && decodeURIComponent(st.overlay.url).split("<circle").length - 1 === 7);
const drawn = await page.evaluate(() => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.tagName === "SONIC-BLOBS") a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  const el = deep(document)[0];
  return el ? el.shadowRoot.querySelectorAll("svg circle").length : -1;
});
check("l'aperçu dessine les marqueurs", drawn === 7, String(drawn));
const shown = await page.evaluate(() => document.body.innerText.includes("Objets") ? (document.body.innerText.match(/Objets\s*:\s*(\d+)/) ?? [])[1] : null);
check("la valeur s'affiche (sonic-value)", shown === "7", String(shown));
await page.screenshot({path: "/tmp/smoke-blobs.png"});
check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 400));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
