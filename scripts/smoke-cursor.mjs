/**
 * Smoke test de `sonic-cursor` (creative-stack, addon cursor) dans le viewer, avec une vraie souris.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-cursor.mjs
 *
 * Vérifie : position et survol nommé publiés pendant de vrais mouvements, suiveur qui rattrape, attraction magnétique puis relâchement,
 * appui, curseur natif masqué, tactile sans suiveur, prefers-reduced-motion.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/cursor.json"), "utf8"));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; connect-src 'self' http://localhost:4455 https:; object-src 'none'; base-uri 'self'";

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  if (/^\/api\/public\/artifacts\/([^/]+)/.test(u.pathname)) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    return r.end(JSON.stringify({id: "cursor", slug: "cursor", title: doc.title, description: "", visibility: "link", document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
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
const page = await (await browser.newContext({viewport: {width: 900, height: 700}})).newPage();
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused|sonic-/i.test(m.text())) errors.push(m.text()); });
await page.goto(`http://localhost:${PORT}/cursor?k=tok`);
await page.waitForTimeout(1500);
const st = () => page.evaluate(() => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.tagName === "SONIC-CURSOR") a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  const el = deep(document)[0];
  return el && el.getState ? JSON.parse(JSON.stringify(el.getState())) : null;
});
const byId = (id, fn) => page.evaluate(([id, fn]) => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.id === id) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  const el = deep(document)[0];
  return el ? new Function("el", `return (${fn})(el)`)(el) : null;
}, [id, fn.toString()]);
const rectOf = (id) => byId(id, (el) => { const r = el.getBoundingClientRect(); return {left: r.left, top: r.top, width: r.width, height: r.height}; });
const shift = (id) => byId(id, (el) => ({t: el.style.translate, mx: el.style.getPropertyValue("--mx")}));
const ring = () => page.evaluate(() => { const d = document.body.querySelector("div[aria-hidden='true']"); return d ? {opacity: d.style.opacity, transform: d.style.transform, blend: d.style.mixBlendMode} : null; });
const settle = async () => { let prev = ""; for (let i = 0; i < 60; i++) { await page.waitForTimeout(100); const s = JSON.stringify(await st()); if (s === prev) return; prev = s; } };

let s = null;
for (let i = 0; i < 50; i++) { s = await st(); if (s) break; await page.waitForTimeout(100); }
check("sonic-cursor monté", !!s);
const btn = await rectOf("aimant");
const far = await rectOf("loin");
check("curseur natif masqué à la souris (pointeur fin)", await page.evaluate(() => getComputedStyle(document.body).cursor === "none"));

await page.mouse.move(10, 10);
await page.mouse.move(far.left + 10, far.top + 5, {steps: 8});
await settle();
s = await st();
check("position publiée = position de la souris", Math.abs(s.x - (far.left + 10)) < 1 && Math.abs(s.y - (far.top + 5)) < 1 && s.inside, JSON.stringify([s.x, s.y]));
check("hors élément nommé : pas de survol", s.hover === null);
check("hors zone magnétique : bouton immobile", (await shift("aimant")).t === "", JSON.stringify(await shift("aimant")));
const r1 = await ring();
check("suiveur visible, mix-blend difference", r1 && r1.opacity === "1" && r1.blend === "difference", JSON.stringify(r1));

// Mouvement vers le bouton : vitesse non nulle, le suiveur est en retard, puis rattrape.
await page.mouse.move(btn.left + btn.width - 6, btn.top + btn.height / 2, {steps: 3});
const mv = await st();
check("pendant le mouvement : vitesse > 0 et suiveur en retard", mv.speed > 50 && Math.hypot(mv.smoothX - mv.x, mv.smoothY - mv.y) > 3, JSON.stringify({speed: mv.speed, sx: mv.smoothX, x: mv.x}));
await page.waitForTimeout(700);
s = await st();
check("sur le bouton : survol nommé « voir »", s.hover && s.hover.name === "voir" && s.hover.id === "aimant", JSON.stringify(s.hover));
check("immobile : vitesse nulle, suiveur rattrapé", s.speed === 0 && s.smoothX === s.x && s.smoothY === s.y, JSON.stringify([s.speed, s.smoothX, s.x]));
const sh = await shift("aimant");
check("le bouton est attiré vers le pointeur (translate, --mx > 0)", sh.t !== "" && parseFloat(sh.mx) > 3 && parseFloat(sh.mx) <= 20.01, JSON.stringify(sh));
const r2 = await ring();
check("suiveur agrandi sur l'élément nommé", r2 && /scale\(2\.5\)/.test(r2.transform), r2 && r2.transform);

// Appui.
await page.mouse.down();
await page.waitForTimeout(150);
check("appui publié", (await st()).down === true);
await page.mouse.up();
await page.waitForTimeout(150);
check("relâchement publié", (await st()).down === false);

// Retour hors zone : le bouton se relâche.
await page.mouse.move(far.left + 10, far.top + 5, {steps: 6});
await page.waitForTimeout(900);
check("hors zone : le bouton revient à sa place", (await shift("aimant")).t === "", JSON.stringify(await shift("aimant")));
check("hors élément nommé : survol vide", (await st()).hover === null);

// prefers-reduced-motion : pas d'inertie.
const ctx2 = await browser.newContext({viewport: {width: 900, height: 700}, reducedMotion: "reduce"});
const p2 = await ctx2.newPage();
await p2.goto(`http://localhost:${PORT}/cursor?k=tok`);
await p2.waitForTimeout(2500);
await p2.mouse.move(100, 100);
await p2.mouse.move(400, 300, {steps: 2});
await p2.waitForTimeout(150);
const red = await p2.evaluate(() => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.tagName === "SONIC-CURSOR") a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  return JSON.parse(JSON.stringify(deep(document)[0].getState()));
});
check("prefers-reduced-motion : le suiveur suit sans retard", red.x === 400 && red.smoothX === 400 && red.smoothY === 300, JSON.stringify([red.x, red.smoothX, red.smoothY]));
await ctx2.close();

// Tactile : pas de suiveur ni d'attraction.
const ctx3 = await browser.newContext({viewport: {width: 900, height: 700}, hasTouch: true, isMobile: true});
const p3 = await ctx3.newPage();
await p3.goto(`http://localhost:${PORT}/cursor?k=tok`);
await p3.waitForTimeout(2500);
const touchRing = await p3.evaluate(() => { const d = document.body.querySelector("div[aria-hidden='true']"); return d ? d.style.opacity : "absent"; });
const touchNative = await p3.evaluate(() => getComputedStyle(document.body).cursor);
check("appareil tactile : suiveur masqué et curseur natif conservé", (touchRing === "0" || touchRing === "") && touchNative !== "none", JSON.stringify([touchRing, touchNative]));
await ctx3.close();

await page.screenshot({path: "/tmp/smoke-cursor.png"});
check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 400));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
