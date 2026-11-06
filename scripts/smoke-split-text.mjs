/**
 * Smoke test de `sonic-split-text` (creative-stack, addon text) dans le viewer, avec un vrai défilement.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-split-text.mjs
 *
 * Vérifie : découpe et texte accessible, lecture automatique à l'entrée dans l'écran, révélation décalée pilotée par le défilement,
 * lignes mesurées, prefers-reduced-motion.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/split-text.json"), "utf8"));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; connect-src 'self' http://localhost:4455 https:; object-src 'none'; base-uri 'self'";

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  if (/^\/api\/public\/artifacts\/([^/]+)/.test(u.pathname)) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    return r.end(JSON.stringify({id: "split-text", slug: "split-text", title: doc.title, description: "", visibility: "link", document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
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
const url = `http://localhost:${PORT}/split-text?k=tok`;
await page.goto(url);
const unitsOf = (id) => page.evaluate((id) => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.id === id) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  const el = deep(document)[0];
  if (!el) return null;
  return {label: el.getAttribute("aria-label"), state: el.getState ? el.getState() : null, units: [...el.querySelectorAll("span[aria-hidden] > span")].map((s) => ({t: s.textContent, o: s.style.opacity, tr: s.style.transform, f: s.style.filter, c: s.style.clipPath, top: s.getBoundingClientRect().top}))};
}, id);
const viewerEval = (fn, arg) => page.evaluate(([fn, arg]) => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.tagName === "ARTIFACT-VIEWER") a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  return new Function("v", "arg", `return (${fn})(v, arg)`)(deep(document)[0], arg);
}, [fn.toString(), arg]);
const scrollView = (y) => viewerEval((v, y) => { v.scrollTop = y; }, y);

// Lecture automatique (lancée dès l'entrée dans l'écran, durée 0,6 s).
await page.waitForTimeout(300);
const early = await unitsOf("auto");
check("texte découpé en 9 caractères, texte complet accessible", early && early.units.length === 9 && early.label === "Bienvenue", JSON.stringify(early && [early.units.length, early.label]));
await page.waitForTimeout(1500);
const done = await unitsOf("auto");
check("lecture automatique terminée : tout au repos", done.state.done && done.units.every((u) => u.o === "" && u.f === ""), JSON.stringify(done.state));

// Révélation au défilement.
let d = null;
for (let i = 0; i < 50; i++) { d = await unitsOf("defile"); if (d && d.units.length === 10) break; await page.waitForTimeout(100); }
check("dix mots découpés", d && d.units.length === 10, String(d && d.units.length));
await page.waitForTimeout(400);
d = await unitsOf("defile");
check("en haut de page : avancement 0, mots masqués (montée)", d.state.progress === 0 && d.units.every((u) => /translateY\(110%\)/.test(u.tr)), JSON.stringify(d.state));
await scrollView(1e6);
await page.waitForTimeout(1500);
d = await unitsOf("defile");
check("en bas de page : avancement 1, tout au repos", d.state.progress > 0.999 && d.units.every((u) => u.tr === ""), JSON.stringify(d.state));
await scrollView(0);
await page.waitForTimeout(300);
const mid = await page.evaluate(() => 0);
await viewerEval((v) => { v.scrollTop = (v.scrollHeight - v.clientHeight) * 0.6; });
await page.waitForTimeout(1200);
d = await unitsOf("defile");
const hidden = d.units.filter((u) => u.tr !== "").length;
check("à mi-course : certains mots révélés, d'autres encore cachés, les premiers d'abord", hidden > 0 && hidden < 10 && d.units[0].tr === "" && d.units[9].tr !== "", JSON.stringify(d.units.map((u) => u.tr === "" ? 1 : 0)));

// Lignes mesurées dans un conteneur étroit.
await scrollView(1e6);
await page.waitForTimeout(1500);
const l = await unitsOf("lignes");
const tops = [...new Set(l.units.map((u) => Math.round(u.top)))];
check("lignes : plusieurs lignes détectées dans 260 px", tops.length >= 3, JSON.stringify(tops));
check("lignes : progress 1, tout au repos (clip-path levé)", l.units.every((u) => u.c === ""), JSON.stringify(l.units.map((u) => u.c)));

// prefers-reduced-motion : tout affiché d'emblée.
const ctx2 = await browser.newContext({viewport: {width: 900, height: 700}, reducedMotion: "reduce"});
const p2 = await ctx2.newPage();
await p2.goto(url);
await p2.waitForTimeout(2500);
const red = await p2.evaluate(() => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.id === "defile") a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  const el = deep(document)[0];
  return [...el.querySelectorAll("span[aria-hidden] > span")].map((s) => s.style.transform + s.style.opacity);
});
check("prefers-reduced-motion : texte entièrement affiché", red.length === 10 && red.every((x) => x === ""), JSON.stringify(red));
await ctx2.close();

await scrollView(0);
await page.waitForTimeout(500);
await page.screenshot({path: "/tmp/smoke-split-text.png"});
check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 400));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
