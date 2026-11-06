/**
 * Smoke test des graphiques `sonic-plot` (creative-stack, addon plot) dans le viewer.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-plot.mjs
 *
 * Sert dist/ avec la CSP de prod + une fausse API publique (tests/fixtures/plot.json).
 * Vérifie : addon chargé à la demande, marques SVG dessinées depuis un store, couleurs des tokens
 * résolues par le navigateur, infobulle au survol, sélection au clic publiée dans le DataProvider,
 * aucune erreur JS / CSP.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/plot.json"), "utf8"));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; connect-src 'self' http://localhost:4455 https:; object-src 'none'; base-uri 'self'";

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  if (/^\/api\/public\/artifacts\/([^/]+)/.test(u.pathname)) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    return r.end(JSON.stringify({id: "plot", slug: "plot", title: doc.title, description: "", visibility: "link", document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
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
await page.goto(`http://localhost:${PORT}/plot?k=tok`);
await page.waitForTimeout(2500);

const marks = await page.evaluate(() => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  const q = (id, s) => deep(document, `#${id}`)[0]?.shadowRoot.querySelectorAll(s).length ?? -1;
  return {lignes: q("courbe", "svg path[stroke-width='2']"), barres: q("barres", "svg rect[rx]"), secteurs: q("anneau", "svg path[fill^='var']"), cellules: q("chaleur", "svg rect[rx]")};
});
check("courbes : une ligne par région", marks.lignes === 3, JSON.stringify(marks));
check("barres : somme par région (3 barres)", marks.barres === 3);
check("donut : 3 secteurs", marks.secteurs === 3);
check("carte de chaleur : 12 × 3 cellules", marks.cellules === 36);

const color = await deepEval(page, "#barres", (el) => getComputedStyle(el.shadowRoot.querySelector("svg rect[rx]")).fill);
check("les couleurs des tokens du thème sont résolues par le navigateur", /^rgb/.test(color ?? "") && color !== "rgb(0, 0, 0)", String(color));

const first = await deepEval(page, "#barres", (el) => { const r = el.shadowRoot.querySelector("svg rect[rx]").getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height - 4}; });
await page.mouse.move(first.x, first.y);
await page.waitForTimeout(200);
const tip = await deepEval(page, "#barres", (el) => el.shadowRoot.querySelector(".tip")?.textContent.trim());
check("survol d'une barre : infobulle avec le libellé et la valeur", /Nord/.test(tip ?? ""), String(tip));
await page.mouse.click(first.x, first.y);
await page.waitForTimeout(200);
const published = await deepEval(page, "#barres", (el) => el.shadowRoot.querySelectorAll("circle.sel").length);
check("clic : repère de sélection affiché", published >= 1, String(published));
await page.screenshot({path: "/tmp/smoke-plot.png"});
check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 400));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
