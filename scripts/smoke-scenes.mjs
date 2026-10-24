/**
 * Smoke test des scènes pilotées par le format `nodes` (creative-stack : physique → sonic-2d / sonic-stage,
 * sonic-timeline nodes-out) dans le viewer.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-scenes.mjs
 *
 * Sert dist/ avec la CSP et la Permissions-Policy de prod (Pixi sans unsafe-eval) + une fausse API publique
 * (tests/fixtures/scene-2d.json, scene-dom.json). Vérifie : addons chargés à la demande, sprites créés,
 * sprites qui suivent les corps, tap → store, caméra animée, éléments HTML placés par la physique,
 * timeline nodes-out, aucune erreur JS / CSP.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const fx = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures", f), "utf8"));
const fixtures = {
  "scene-2d": fx("scene-2d.json"),
  "scene-dom": fx("scene-dom.json"),
};
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; media-src 'self' https: blob: data:; connect-src 'self' https: blob:; worker-src 'self' blob: https://cdn.jsdelivr.net; child-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const PERMISSIONS = "camera=(self), microphone=(self), midi=(self), display-capture=(self), geolocation=(), payment=(), usb=(), browsing-topics=()";

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  const m = /^\/api\/public\/artifacts\/([^/]+)/.exec(u.pathname);
  if (m) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    const doc = fixtures[m[1]];
    return r.end(JSON.stringify({id: m[1], slug: m[1], title: doc.title, description: "", visibility: "link",
      document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
  }
  let f = path.join(DIST, u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  const t = f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".svg") ? "image/svg+xml" : "text/html";
  r.writeHead(200, {"Content-Type": t, "Content-Security-Policy": CSP, "Permissions-Policy": PERMISSIONS});
  r.end(fs.readFileSync(f));
}).listen(PORT);

let failures = 0;
const check = (label, ok, detail = "") => { console.log(`${ok ? "✔" : "✘"} ${label}${detail ? "  — " + detail : ""}`); if (!ok) failures++; };
const state = (p, id) => p.evaluate((id) => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  const el = deep(document, `#${id}`)[0];
  return el && typeof el.getState === "function" ? JSON.parse(JSON.stringify(el.getState())) : null;
}, id);
const storeState = (p, id) => p.evaluate((id) => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  const el = deep(document, `sonic-store#${id}`)[0];
  return el?.state ? JSON.parse(JSON.stringify(el.state)) : null;
}, id);

const deepEval = (p, sel, fn, arg) => p.evaluate(([sel, fn, arg]) => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  const el = deep(document, sel)[0];
  return el ? new Function("el", `return (${fn})(el)`)(el) : null;
}, [sel, fn.toString(), arg]);
const box = async (p, sel) => p.locator(sel).first().boundingBox();

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]});
const errors = [];
const open = async (slug) => {
  const page = await (await browser.newContext({viewport: {width: 900, height: 900}})).newPage();
  page.on("pageerror", (e) => errors.push(`${slug}: ${e}`));
  page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused|unsafe-eval|Permissions policy|sonic-|pixi/i.test(m.text())) errors.push(`${slug}: ${m.text()}`); });
  await page.goto(`http://localhost:${PORT}/${slug}?k=tok`);
  await page.waitForTimeout(3000);
  return page;
};

/* ---------------------------------------------------------------- sonic-2d (Pixi) */
let p = await open("scene-2d");
const r2d = await deepEval(p, "sonic-2d", (el) => ({ready: el.runtime?.isReady, count: el.runtime?.count, missing: el.runtime?.nodes.missing}));
check("sonic-2d prêt sous la CSP de prod (Pixi sans unsafe-eval), 25 sprites", r2d?.ready === true && r2d.count === 25, JSON.stringify(r2d));
const follow = await p.evaluate(() => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  const w = deep(document, "#monde")[0].getState();
  const n = deep(document, "sonic-2d")[0].runtime.nodes.state("b2");
  return {phys: w.nodes.b2, shown: n};
});
check("les sprites suivent les corps (nodes-plane=screen → nodes)", follow.shown && Math.abs(follow.shown.y - follow.phys.y) < 30 && follow.phys.y > 120, JSON.stringify(follow));
let jeu = await storeState(p, "jeu");
const b = await box(p, "sonic-2d");
const k = b.width / 800;
const b2 = follow.phys;
await p.mouse.click(b.x + (400 + (b2.x - jeu.camera.x)) * k, b.y + (225 + (b2.y - jeu.camera.y)) * k);
await p.waitForTimeout(300);
jeu = await storeState(p, "jeu");
check("tap sur une bille → action pick {objectId: b2} dans le store", jeu.taps === 1, JSON.stringify({taps: jeu.taps}));
await p.mouse.click(b.x + 760 * k, b.y + 120 * k);
await p.waitForTimeout(1200);
jeu = await storeState(p, "jeu");
const cam = await deepEval(p, "sonic-2d", (el) => el.runtime ? {x: el.runtime.app.stage.children.find((c) => c.label === "layer:monde")?.x} : null);
check("tap dans le vide → caméra déplacée (ease) et calque monde translaté", jeu.camera.x > 700 && cam?.x < -200, JSON.stringify({camera: jeu.camera, layer: cam}));
await p.screenshot({path: "/tmp/smoke-scene-2d.png"});

/* ---------------------------------------------------------------- sonic-stage (DOM) */
p = await open("scene-dom");
const dom = await p.evaluate(() => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  const w = deep(document, "#monde")[0].getState();
  const b1 = deep(document, "#b1")[0];
  return {phys: w.nodes.b1, transform: b1?.style.transform, carte: deep(document, "#carte")[0]?.style.transform};
});
check("sonic-stage : éléments HTML placés par la physique", /translate\(/.test(dom.transform ?? "") && /rotate\(-0\.10/.test(dom.carte ?? ""), JSON.stringify(dom));
const bb = await box(p, "#b1");
await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
await p.waitForTimeout(300);
check("tap sur un élément de scène → store", (await storeState(p, "jeu")).taps === 1);
const t1 = await deepEval(p, "#badge", (el) => el.style.transform);
await p.waitForTimeout(400);
const t2 = await deepEval(p, "#badge", (el) => el.style.transform);
check("sonic-timeline nodes-out anime un élément de sonic-stage", !!t1 && t1 !== t2, `${t1} → ${t2}`);
await p.screenshot({path: "/tmp/smoke-scene-dom.png"});

check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 400));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
