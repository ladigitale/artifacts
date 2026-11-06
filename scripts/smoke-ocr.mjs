/**
 * Smoke test de `sonic-ocr` (creative-stack, addon ocr) : lecture de texte avec le vrai moteur Tesseract.js.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-ocr.mjs
 *
 * Sert dist/ avec la CSP de prod + une fausse API publique (tests/fixtures/ocr.json).
 * Le réseau est simulé : les requêtes vers cdn.jsdelivr.net sont servies depuis les paquets npm
 * (tesseract.js, tesseract.js-core, @tesseract.js-data/eng) installés dans OCR_PKG (défaut /tmp/ocr-pkg).
 * Vérifie : script épinglé accepté (intégrité + CSP), worker WebAssembly lancé, texte lu et positionné,
 * aucune erreur JS / CSP.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/ocr.json"), "utf8"));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; media-src 'self' https: blob: data:; connect-src 'self' https: blob:; worker-src 'self' blob: https://cdn.jsdelivr.net; child-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  if (/^\/api\/public\/artifacts\/([^/]+)/.test(u.pathname)) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    return r.end(JSON.stringify({id: "ocr", slug: "ocr", title: doc.title, description: "", visibility: "link", document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
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
const PKG = process.env.OCR_PKG ?? "/tmp/ocr-pkg";
const MAP = [
  [/^\/npm\/tesseract\.js@7\.0\.0\/(.+)$/, "node_modules/tesseract.js/$1"],
  [/^\/npm\/tesseract\.js-core@7\.0\.0\/(.+)$/, "node_modules/tesseract.js-core/$1"],
  [/^\/npm\/@tesseract\.js-data\/eng\/(.+)$/, "node_modules/@tesseract.js-data/eng/$1"],
];
const served = [];
await page.route("https://cdn.jsdelivr.net/**", (route) => {
  const u = new URL(route.request().url());
  for (const [re, to] of MAP) {
    const m = re.exec(u.pathname);
    if (!m) continue;
    const f = path.join(PKG, to.replace("$1", m[1]));
    if (!f.startsWith(PKG) || !fs.existsSync(f)) break;
    served.push(u.pathname);
    const type = f.endsWith(".wasm") ? "application/wasm" : f.endsWith(".js") ? "text/javascript" : "application/octet-stream";
    return route.fulfill({status: 200, body: fs.readFileSync(f), headers: {"Content-Type": type, "Access-Control-Allow-Origin": "*"}});
  }
  return route.fulfill({status: 404, body: "absent"});
});
await page.addInitScript(() => {
  window.__o = null;
  document.addEventListener("ocr-state", (e) => { if (e.detail.status === "ready" || e.detail.status === "error") window.__o = e.detail; });
});
await page.goto(`http://localhost:${PORT}/ocr?k=tok`);
await page.waitForFunction(() => window.__o, null, {timeout: 90000}).catch(() => {});
const st = await page.evaluate(() => window.__o);
check("lecture terminée sans erreur", st?.status === "ready", String(st?.error));
check("première ligne lue", /Hello World 2026/.test(st?.lines?.[0]?.text ?? ""), JSON.stringify(st?.lines?.[0]?.text));
check("seconde ligne lue", /Bonjour le monde/.test(st?.lines?.[1]?.text ?? ""), JSON.stringify(st?.lines?.[1]?.text));
check("positions en pixels de l'image d'origine", st?.lines?.[0]?.x > 0 && st.lines[0].w > 150 && st.lines[1].y > st.lines[0].y, JSON.stringify(st?.lines?.[0]));
check("confiance élevée", st?.confidence >= 80, String(st?.confidence));
check("moteur servi par jsDelivr épinglé", served.some((p) => p.endsWith("/dist/tesseract.min.js")) && served.some((p) => p.includes("tesseract.js-core@7.0.0")) && served.some((p) => p.endsWith("eng.traineddata.gz")), served.join(", "));
check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 400));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
