/**
 * Smoke test de `sonic-train` / `sonic-predict` (creative-stack, addon predict) dans le viewer.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-predict.mjs
 *
 * Vérifie : CSV lu depuis un store, entraînement automatique sous la CSP de prod, courbe d'apprentissage
 * tracée par sonic-plot, métriques et importance des variables, prédiction à partir d'une saisie, aucune erreur JS / CSP.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/predict.json"), "utf8"));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; connect-src 'self' http://localhost:4455 https:; object-src 'none'; base-uri 'self'";

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  if (/^\/api\/public\/artifacts\/([^/]+)/.test(u.pathname)) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    return r.end(JSON.stringify({id: "predict", slug: "predict", title: doc.title, description: "", visibility: "link", document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
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
await page.goto(`http://localhost:${PORT}/predict?k=tok`);
await page.waitForTimeout(1500);
const stateOf = (tag) => page.evaluate((tag) => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.tagName === tag) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  const el = deep(document)[0];
  return el && el.getState ? JSON.parse(JSON.stringify(el.getState())) : null;
}, tag);

let st = null;
for (let i = 0; i < 100; i++) { st = await stateOf("SONIC-TRAIN"); if (st && st.status === "done") break; await page.waitForTimeout(100); }
check("l'entraînement automatique se termine", st && st.status === "done", st && st.status + " " + (st.error ?? ""));
check("CSV lu : 150 lignes, cible prix, régression", st.rows === 150 && st.target === "prix" && st.task === "regression", JSON.stringify([st.rows, st.target, st.task]));
check("courbe d'apprentissage de 200 époques qui descend", st.curve.length === 200 && st.curve[199].train < st.curve[0].train / 10, `${st.curve[0]?.train} → ${st.curve[199]?.train}`);
check("le modèle bat nettement la ligne de base (R² > 0,95)", st.metrics.r2 > 0.95 && st.metrics.rmse < st.metrics.baselineRmse / 4, JSON.stringify(st.metrics));
check("la surface est la variable la plus importante", st.importance[0].name === "surface", JSON.stringify(st.importance));
check("modèle JSON produit", st.model && st.model.format === "sonic-model/1" && st.model.features.length === 3);

await page.waitForTimeout(300);
const pr = await stateOf("SONIC-PREDICT");
const expected = 50 * 2000 + 3 * 5000 + 100000;
check("sonic-predict prédit la saisie (50 m², 3 pièces, Paris)", pr && pr.status === "ready" && pr.prediction && Math.abs(pr.prediction.value - expected) < 12000, JSON.stringify(pr && pr.prediction));
check("… et liste les variables attendues pour bâtir un formulaire", pr.inputs.length === 3 && pr.inputs.find((i) => i.name === "ville").values.includes("Paris"));

const curveDrawn = await page.evaluate(() => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.tagName === "SONIC-PLOT") a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  const plot = deep(document)[0];
  const svg = plot && plot.shadowRoot && plot.shadowRoot.querySelector("svg");
  return svg ? svg.querySelectorAll("path").length : -1;
});
check("sonic-plot trace la courbe d'apprentissage", curveDrawn >= 2, String(curveDrawn));
await page.screenshot({path: "/tmp/smoke-predict.png"});
check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 400));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
