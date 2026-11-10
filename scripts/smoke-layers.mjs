/**
 * Smoke test des calques : `sonic-paint navigable` (pixels) sous `sonic-sketch` (vectoriel, fond transparent),
 * vue partagée par `view-sync`.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-layers.mjs
 *
 * Vérifie : vues alignées (cadrage initial de l'image adopté par le vectoriel, zoom à la molette suivi), pipette
 * à travers les calques (depuis chaque toile), fusion du calque vectoriel dans les pixels (`stamp-from`),
 * vectorisation du calque pixel sur une palette imposée importée en aplats à sa place (`import-from`),
 * aucune erreur JS / CSP.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/calques.json"), "utf8"));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; connect-src 'self' http://localhost:4455 https:; object-src 'none'; base-uri 'self'";

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  if (/^\/api\/public\/artifacts\/([^/]+)/.test(u.pathname)) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    return r.end(JSON.stringify({id: "calques", slug: "calques", title: doc.title, description: "", visibility: "link", document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
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
const page = await (await browser.newContext({viewport: {width: 900, height: 1000}})).newPage();
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused|sonic-/i.test(m.text())) errors.push(m.text()); });
await page.goto(`http://localhost:${PORT}/calques?k=tok`);
await page.waitForTimeout(1800);

const on = (tag, fn, arg) => page.evaluate(([tag, fn, arg]) => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.tagName === tag) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  const el = deep(document)[0];
  return el ? new Function("el", "arg", `return (${fn})(el, arg)`)(el, arg) : null;
}, [tag, fn.toString(), arg]);
const P = (fn, arg) => on("SONIC-PAINT", fn, arg), V = (fn, arg) => on("SONIC-SKETCH", fn, arg);
const box = await V((el) => { const r = el.getFrameCanvas().getBoundingClientRect(); return {x: r.x, y: r.y}; });
const at = (x, y) => [box.x + x, box.y + y];
const drag = async (x0, y0, x1, y1) => {
  await page.mouse.move(...at(x0, y0));
  await page.mouse.down();
  await page.mouse.move(...at(x1, y1), {steps: 12});
  await page.mouse.up();
  await page.waitForTimeout(150);
};
const active = (which) => page.evaluate((which) => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (/^SONIC-(PAINT|SKETCH)$/.test(e.tagName)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  for (const e of deep(document)) e.style.pointerEvents = e.tagName === which ? "auto" : "none";
}, which);
const near = (hex, ref, tol = 6) => !!hex && [1, 3, 5].every((i) => Math.abs(parseInt(hex.slice(i, i + 2), 16) - parseInt(ref.slice(i, i + 2), 16)) <= tol);

let ps = await P((el) => el.getState()), vs = await V((el) => el.getState());
check("vue initiale : le vectoriel adopte le cadrage de l'image", Math.abs(ps.zoom - vs.zoom) < 1e-9 && Math.abs(ps.x - vs.x) < 1e-9 && Math.abs(ps.x - 300) < 1 && ps.zoom < 1, JSON.stringify({p: [ps.x, ps.y, ps.zoom], v: [vs.x, vs.y, vs.zoom]}));

// Calque pixel actif : une ligne bleue ; calque vectoriel actif : un trait vert qui la croise.
await active("SONIC-PAINT");
await drag(100, 100, 500, 100);
await active("SONIC-SKETCH");
await drag(300, 50, 300, 350);
ps = await P((el) => el.getState()); vs = await V((el) => el.getState());
check("un trait par calque", ps.strokes === 1 && vs.strokes === 1, JSON.stringify({p: ps.strokes, v: vs.strokes}));

// Molette sur le calque vectoriel : la vue des pixels suit.
await page.mouse.move(...at(300, 100));
for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(40); }
await page.waitForTimeout(300);
ps = await P((el) => el.getState()); vs = await V((el) => el.getState());
check("zoom à la molette : les deux vues restent identiques", vs.zoom > 1.5 && Math.abs(ps.zoom - vs.zoom) < 1e-9 && Math.abs(ps.x - vs.x) < 1e-9 && Math.abs(ps.y - vs.y) < 1e-9, JSON.stringify({p: [ps.x, ps.y, ps.zoom], v: [vs.x, vs.y, vs.zoom]}));
// Le croisement reste au même endroit à l'écran pour les deux calques : sous le pointeur, vert par-dessus bleu.
await V((el) => { el.tool = "pick"; });
await page.mouse.click(...at(300, 100));
vs = await V((el) => el.getState());
check("pipette (vectoriel) sur le croisement : le vert du dessus, exact", vs.picked === "#16a34a", String(vs.picked));
const xBlue = 300 + 60;
await page.mouse.click(...at(xBlue, 100));
vs = await V((el) => el.getState());
check("pipette (vectoriel) hors du trait : la couleur du calque pixel dessous", near(vs.picked, "#1d4ed8", 3), String(vs.picked));
await page.mouse.click(...at(xBlue, 300));
vs = await V((el) => el.getState());
check("pipette sur le vide : le blanc de l'image", vs.picked === "#ffffff", String(vs.picked));
await V((el) => { el.tool = "paint"; });

await active("SONIC-PAINT");
await P((el) => { el.tool = "pick"; });
await page.mouse.click(...at(300, 100));
ps = await P((el) => el.getState());
check("pipette (pixel) : voit le calque vectoriel au-dessus", ps.picked === "#16a34a" && ps.color === "#16a34a", JSON.stringify({p: ps.picked, c: ps.color}));
await P((el) => { el.tool = "paint"; });

// Fusion du calque vectoriel dans les pixels, puis calque vectoriel masqué : le vert est dans l'image.
await P((el) => el.stampSources());
await V((el) => { el.style.display = "none"; });
await page.waitForTimeout(150);
ps = await P((el) => el.getState());
const pix = await P((el, [x, y]) => { const c = el.shadowRoot.querySelector("canvas"); const r = c.getBoundingClientRect(); return el.pickAt(r.x + x, r.y + y)?.pixel ?? null; }, [300, 100 + 30]);
check("stamp : le trait vectoriel est fondu dans l'image, à sa place", ps.strokes === 2 && pix && Math.abs(pix[0] - 22) < 8 && Math.abs(pix[1] - 163) < 8 && Math.abs(pix[2] - 74) < 8, JSON.stringify({s: ps.strokes, pix}));
await V((el) => { el.style.display = ""; });

// Vectorisation du calque pixel (palette imposée) importée en aplats dans le vectoriel, à sa place.
const before = (await V((el) => el.getState())).strokes;
await on("SONIC-VECTORIZE", (el) => el.run());
await page.waitForFunction(() => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.tagName === "SONIC-SKETCH") a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  return !!deep(document)[0]?.getState().imported;
}, null, {timeout: 15000}).catch(() => {});
vs = await V((el) => el.getState());
const vz = await on("SONIC-VECTORIZE", (el) => ({paths: el.stateValue.paths.map((p) => p.color), frame: el.stateValue.frame}));
check("vectorisation du calque pixel : couleurs de la palette imposée", vz.paths.length >= 2 && vz.paths.every((c) => ["#1d4ed8", "#16a34a", "#ffffff"].includes(c)) && !!vz.frame, JSON.stringify(vz));
check("import automatique en aplats (papier blanc ignoré), une étape", vs.imported && vs.imported.layers >= 2 && vs.colors >= 2 && vs.canUndo, JSON.stringify(vs.imported) + " " + JSON.stringify({c: vs.colors, s: vs.strokes, before}));
await P((el) => { el.style.display = "none"; });
await active("SONIC-SKETCH");
await V((el) => { el.tool = "pick"; });
await page.mouse.click(...at(xBlue, 100));
vs = await V((el) => el.getState());
check("formes importées à leur place : le bleu de la ligne, exact, sans le calque pixel", vs.picked === "#1d4ed8", String(vs.picked));
await page.mouse.click(...at(xBlue, 300));
vs = await V((el) => el.getState());
check("… et rien là où l'image était blanche", vs.picked === "#ffffff", String(vs.picked));
await V((el) => { el.tool = "paint"; });
await P((el) => { el.style.display = ""; });

await page.screenshot({path: "/tmp/smoke-layers.png"});
check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 400));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
