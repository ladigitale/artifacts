/**
 * Smoke test des transitions entre vues (`viewTransition`) dans le viewer.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-view-transition.mjs
 *
 * Vérifie : la bascule passe par startViewTransition avec le type et le sens demandés, la page entière est animée (groupe racine),
 * l'état est nettoyé, retour en sens inverse, prefers-reduced-motion sans transition.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/view-transition.json"), "utf8"));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; connect-src 'self' http://localhost:4455 https:; object-src 'none'; base-uri 'self'";

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  if (/^\/api\/public\/artifacts\/([^/]+)/.test(u.pathname)) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    return r.end(JSON.stringify({id: "view-transition", slug: "view-transition", title: doc.title, description: "", visibility: "link", document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
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
const spy = () => {
  window.__vt = [];
  const orig = document.startViewTransition.bind(document);
  document.startViewTransition = (cb) => {
    const rec = {kind: document.documentElement.dataset.viewTransition, dir: document.documentElement.dataset.viewDirection, pseudos: []};
    window.__vt.push(rec);
    const t = orig(cb);
    t.ready.then(() => { rec.pseudos = document.getAnimations().map((a) => a.effect && a.effect.pseudoElement).filter(Boolean); }).catch(() => {});
    return t;
  };
};
const mkPage = async (opts = {}) => {
  const ctx = await browser.newContext({viewport: {width: 900, height: 600}, ...opts});
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused/i.test(m.text())) errors.push(m.text()); });
  await p.goto(`http://localhost:${PORT}/view-transition?k=tok`);
  await p.waitForTimeout(1500);
  await p.evaluate(spy);
  return p;
};
const has = (p, id) => p.evaluate((id) => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.id === id) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  return deep(document).length > 0;
}, id);
const click = (p, id) => p.evaluate((id) => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.id === id) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  deep(document)[0].click();
}, id);

const page = await mkPage();
check("vue d'accueil affichée", await has(page, "titre-accueil") && !(await has(page, "titre-detail")));
check("startViewTransition disponible", await page.evaluate(() => typeof document.startViewTransition === "function"));
await click(page, "vers-detail");
await page.waitForTimeout(1200);
check("après le clic : vue détail", (await has(page, "titre-detail")) && !(await has(page, "titre-accueil")));
let vt = await page.evaluate(() => window.__vt);
check("une transition lancée, type slide, sens avant", vt.length === 1 && vt[0].kind === "slide" && vt[0].dir === "forward", JSON.stringify(vt));
check("la transition de page est jouée (pseudo-éléments racine)", vt[0].pseudos.some((x) => /view-transition-old\(root\)/.test(x)) && vt[0].pseudos.some((x) => /view-transition-new\(root\)/.test(x)), JSON.stringify(vt[0].pseudos));
check("l'état de transition est nettoyé", await page.evaluate(() => !document.documentElement.dataset.viewTransition && !document.documentElement.dataset.viewDirection));
check("l'URL porte la vue", (await page.evaluate(() => location.hash)) === "#detail");

await click(page, "retour");
await page.waitForTimeout(1200);
vt = await page.evaluate(() => window.__vt);
check("retour : vue d'accueil, sens inverse", (await has(page, "titre-accueil")) && vt.length === 2 && vt[1].dir === "back", JSON.stringify(vt.map((x) => x.dir)));
await page.screenshot({path: "/tmp/smoke-view-transition.png"});

// Navigation arrière du navigateur (hashchange).
await click(page, "vers-detail");
await page.waitForTimeout(1000);
await page.goBack();
await page.waitForTimeout(1000);
check("historique du navigateur : la vue suit", await has(page, "titre-accueil"));

// prefers-reduced-motion : changement immédiat, aucune transition.
const p2 = await mkPage({reducedMotion: "reduce"});
await click(p2, "vers-detail");
await p2.waitForTimeout(500);
check("prefers-reduced-motion : vue changée sans transition", (await has(p2, "titre-detail")) && (await p2.evaluate(() => window.__vt.length)) === 0);

check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 400));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
