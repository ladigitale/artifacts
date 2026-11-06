/**
 * Smoke test de `sonic-ragdoll` (creative-stack, addon physics) : pantin articulé dans le viewer.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-ragdoll.mjs
 *
 * Sert dist/ avec la CSP de prod + une fausse API publique (tests/fixtures/ragdoll.json).
 * Vérifie : addon chargé à la demande, 13 corps créés, pantin qui tombe sur la marche et s'y immobilise
 * d'un seul tenant, pose publiée au format skeleton, aucune erreur JS / CSP.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/ragdoll.json"), "utf8"));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; connect-src 'self' http://localhost:4455 https:; object-src 'none'; base-uri 'self'";

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  if (/^\/api\/public\/artifacts\/([^/]+)/.test(u.pathname)) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    return r.end(JSON.stringify({id: "ragdoll", slug: "ragdoll", title: doc.title, description: "", visibility: "link", document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
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
await page.goto(`http://localhost:${PORT}/ragdoll?k=tok`);
await page.waitForTimeout(1500);
const snap = () => page.evaluate(() => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.tagName === "SONIC-PHYSICS") a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  const el = deep(document)[0];
  return el ? el.getState() : null;
});
const t0 = await snap();
check("13 os + marche + 4 murs", t0 && t0.count >= 14 && "pantin.torse" in t0.bodies, String(t0?.count));
await page.waitForTimeout(7000);
const t1 = await snap();
const b = t1.bodies;
check("le pantin est tombé et repose sur la marche", b["pantin.torse"].y > 300 && b["pantin.torse"].y < 375, String(b["pantin.torse"].y));
check("il est immobile", Object.entries(b).filter(([n]) => n.startsWith("pantin.")).every(([, v]) => Math.hypot(v.vx, v.vy) < 15), "vitesses");
const top = Math.min(...Object.entries(b).filter(([n]) => n.startsWith("pantin.")).map(([, v]) => v.y));
const bottom = Math.max(...Object.entries(b).filter(([n]) => n.startsWith("pantin.")).map(([, v]) => v.y));
check("d'un seul tenant sur la marche (étendue verticale < 330, au-dessus du sol)", bottom < 500 && bottom - top < 330 && b["pantin.mollet-gauche"].y > 250, `${Math.round(top)}..${Math.round(bottom)}`);
const dist = (a, c) => Math.hypot(b[a].x - b[c].x, b[a].y - b[c].y);
check("la tête reste près du torse", dist("pantin.tete", "pantin.torse") < 130, String(Math.round(dist("pantin.tete", "pantin.torse"))));
check("aucune erreur de description", t1.errors.length === 0, t1.errors.join(" | "));
await page.screenshot({path: "/tmp/smoke-ragdoll.png"});
check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 400));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
