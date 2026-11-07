/**
 * Smoke test de `sonic-scroll` (creative-stack, addon scroll) dans le viewer, avec un vrai défilement.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-scroll.mjs
 *
 * Vérifie : avancement et sections lus pendant une vraie molette, valeur lissée qui rattrape puis se fige, vitesse qui
 * retombe, section épinglée (pin), timeline pilotée par le défilement, commande scrollTo, prefers-reduced-motion.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/scroll.json"), "utf8"));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; connect-src 'self' http://localhost:4455 https:; object-src 'none'; base-uri 'self'";

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
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
const page = await (await browser.newContext({viewport: {width: 900, height: 700}})).newPage();
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused|sonic-/i.test(m.text())) errors.push(m.text()); });
await page.goto(`http://localhost:${PORT}/scroll?k=tok`);
await page.waitForTimeout(1500);
const st = () => page.evaluate(() => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.tagName === "SONIC-SCROLL") a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  const el = deep(document)[0];
  return el && el.getState ? JSON.parse(JSON.stringify(el.getState())) : null;
});
const opacity = () => page.evaluate(() => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.id === "titre") a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  const el = deep(document)[0];
  return el ? Number(getComputedStyle(el).opacity) : null;
});
const viewerEval = (fn, arg) => page.evaluate(([fn, arg]) => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.tagName === "ARTIFACT-VIEWER") a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  return new Function("v", "arg", `return (${fn})(v, arg)`)(deep(document)[0], arg);
}, [fn.toString(), arg]);
const scrollView = (y) => viewerEval((v, y) => { v.scrollTop = y; }, y);
const etapeTop = (id) => page.evaluate((id) => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.id === id) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  const el = deep(document)[0];
  const v = (() => { const d2 = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.tagName === "ARTIFACT-VIEWER") a.push(e); if (e.shadowRoot) d2(e.shadowRoot, a); }); return a; }; return d2(document)[0]; })();
  return el.getBoundingClientRect().top - v.getBoundingClientRect().top + v.scrollTop;
}, id);
const settle = async () => { let prev = ""; for (let i = 0; i < 60; i++) { await page.waitForTimeout(100); const s = JSON.stringify(await st()); if (s === prev) return; prev = s; } };

let s = null;
for (let i = 0; i < 50; i++) { s = await st(); if (s && s.sections.length === 3) break; await page.waitForTimeout(100); }
check("trois sections suivies", s && s.sections.length === 3 && s.sections.map((x) => x.id).join() === "etape1,etape2,etape3", JSON.stringify(s && s.sections.map((x) => x.id)));
check("au départ : haut de page, avancement 0, première section active", s.atTop && s.progress === 0 && s.active.index === 0, JSON.stringify([s.atTop, s.progress, s.active]));
check("la visionneuse est le conteneur défilant : hauteur de 500 vh (max ≈ 400 vh)", s.max > 4 * 700 - 2 && s.max < 4 * 700 + 120, String(s.max));
await page.waitForTimeout(300);
check("timeline au repos : titre invisible", (await opacity()) < 0.05, String(await opacity()));

// Vraie molette.
await page.mouse.move(450, 350);
await page.mouse.wheel(0, 700);
await page.waitForTimeout(120);
const mid = await st();
check("la molette fait avancer la position et le sens est vers le bas", mid.y > 100 && mid.direction === 1 && mid.velocity > 50, JSON.stringify({y: mid.y, d: mid.direction, v: mid.velocity}));
await settle();
const rest = await st();
check("après la molette : vitesse nulle, valeur lissée = position", rest.velocity === 0 && rest.direction === 0 && rest.smoothY === rest.y, JSON.stringify({v: rest.velocity, sy: rest.smoothY, y: rest.y}));
check("avancement = y / max", Math.abs(rest.progress - rest.y / rest.max) < 0.001, `${rest.progress} vs ${rest.y / rest.max}`);

// Section épinglée : y = 1 vh + 1 vh → au milieu des 200 vh de course.
const pinTarget = Math.round((await etapeTop("etape2")) + (3 * 700 - 700) / 2);
await scrollView(pinTarget);
await settle();
const pinned = await st();
check("section épinglée à mi-course : active = etape2, pin ≈ 0,5", pinned.active.id === "etape2" && Math.abs(pinned.active.pin - 0.5) < 0.01, JSON.stringify(pinned.active));
check("etape1 est sortie, progress des sections cohérents", pinned.sections[0].progress === 1 && !pinned.sections[0].inView && pinned.sections[1].inView, JSON.stringify(pinned.sections.map((x) => [x.progress, x.inView])));

// Timeline pilotée par le défilement (progress 1 → titre pleinement visible).
await scrollView(1e6);
await settle();
await page.waitForTimeout(200);
const end = await st();
check("bas de page : atEnd, avancement 1, section active = etape3", end.atEnd && end.progress === 1 && end.active.id === "etape3", JSON.stringify([end.atEnd, end.progress, end.active.id]));
check("la timeline suit le défilement lissé (titre visible)", (await opacity()) > 0.95, String(await opacity()));

// Le lissage rattrape avec du retard : saut brutal vers le haut.
await scrollView(0);
await page.waitForTimeout(60);
const lag = await st();
check("saut vers le haut : la valeur lissée est encore en retard", lag.y === 0 && lag.smoothY > 100 && lag.direction === -1, JSON.stringify({y: lag.y, sy: lag.smoothY, d: lag.direction}));
await settle();
check("… puis rattrape", (await st()).smoothY === 0);

// Commande par le composant (le DataProvider de commande est testé en jsdom).
await page.evaluate(() => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.tagName === "SONIC-SCROLL") a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  deep(document)[0].scrollTo("#etape3");
});
await page.waitForTimeout(1500);
const jumped = await st();
check("scrollTo(#etape3) amène la troisième section en haut", Math.abs(jumped.y - (await etapeTop("etape3"))) < 6 && jumped.active.id === "etape3", JSON.stringify([jumped.y, jumped.active.id]));

// prefers-reduced-motion : pas d'inertie.
const ctx2 = await browser.newContext({viewport: {width: 900, height: 700}, reducedMotion: "reduce"});
const p2 = await ctx2.newPage();
await p2.goto(`http://localhost:${PORT}/scroll?k=tok`);
await p2.waitForTimeout(2500);
await p2.evaluate(() => { const d = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.tagName === "ARTIFACT-VIEWER") a.push(e); if (e.shadowRoot) d(e.shadowRoot, a); }); return a; }; d(document)[0].scrollTop = 900; });
await p2.waitForTimeout(150);
const red = await p2.evaluate(() => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.tagName === "SONIC-SCROLL") a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  return JSON.parse(JSON.stringify(deep(document)[0].getState()));
});
check("prefers-reduced-motion : la valeur lissée suit sans retard", red.y === 900 && red.smoothY === 900, JSON.stringify([red.y, red.smoothY]));
await ctx2.close();

await page.screenshot({path: "/tmp/smoke-scroll.png"});
check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 400));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
