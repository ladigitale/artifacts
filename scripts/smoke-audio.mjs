/**
 * Smoke test de l'addon creative-stack `audio` dans le viewer Artefacts.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-audio.mjs
 *
 * Sert dist/ avec la CSP de prod + une fausse API publique qui renvoie
 * tests/fixtures/premier-son.json et tests/fixtures/vie-sonore.json, puis vérifie :
 * déverrouillage au premier geste (sans perte de la première note), sonic-patch
 * (preset, patch écrit à la main, kit), filtre piloté par le store,
 * sonic-sequencer en mode store et direct, analyseur et texture du shader Concorde,
 * aucune erreur JS / CSP.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const fixtures = {
  "premier-son": JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/premier-son.json"), "utf8")),
  "vie-sonore": JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/vie-sonore.json"), "utf8")),
};
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; media-src 'self' https: blob: data:; connect-src 'self' https: blob:; worker-src 'self' blob: https://cdn.jsdelivr.net; child-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

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
  r.writeHead(200, {"Content-Type": t, "Content-Security-Policy": CSP});
  r.end(fs.readFileSync(f));
}).listen(PORT);

let failures = 0;
const check = (label, ok, detail = "") => { console.log(`${ok ? "✔" : "✘"} ${label}${detail ? "  — " + detail : ""}`); if (!ok) failures++; };

/** État d'un composant par son id (états publiés par les éléments eux-mêmes). */
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

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]});

async function open(slug) {
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused/.test(m.text())) errors.push(m.text()); });
  await page.goto(`http://localhost:${PORT}/${slug}?k=tok`);
  await page.waitForTimeout(2500);
  return {page, errors};
}

console.log("\n== premier-son");
{
  const {page, errors} = await open("premier-son");
  let lead = await state(page, "lead");
  check("sonic-patch preset monté, en attente du geste", lead?.status === "idle" && lead.errors.length === 0, JSON.stringify(lead));
  check("patch écrit à la main compilé", (await state(page, "hand"))?.errors.length === 0);
  await page.keyboard.press("a");
  await page.waitForTimeout(400);
  lead = await state(page, "lead");
  check("première touche : son actif et note jouée", lead?.status === "ready" && lead.played === 1, JSON.stringify(lead));
  for (const k of ["s", "d"]) { await page.keyboard.press(k); await page.waitForTimeout(120); }
  await page.keyboard.press("2");
  await page.keyboard.press("ArrowUp");
  for (const k of ["f", "g"]) { await page.keyboard.press(k); await page.waitForTimeout(120); }
  for (const k of ["z", "x", "c"]) { await page.keyboard.press(k); await page.waitForTimeout(120); }
  const hand = await state(page, "hand");
  const kit = await state(page, "kit");
  const piano = await storeState(page, "piano");
  check("lead : 3 notes", (await state(page, "lead"))?.played === 3);
  check("patch maison : 2 notes, filtre piloté", hand?.played === 2 && piano?.cutoff === 1350, `played=${hand?.played} cutoff=${piano?.cutoff}`);
  check("kit : 3 frappes", kit?.played === 3, JSON.stringify(kit));
  await page.waitForTimeout(1500);
  check("voix libérées", (await state(page, "lead"))?.voices === 0 && (await state(page, "hand"))?.voices === 0);
  check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 300));
  await page.close();
}

console.log("\n== vie-sonore");
{
  const {page, errors} = await open("vie-sonore");
  let life = await storeState(page, "life");
  check("store initialisé (boot-action)", life?.population > 0 && !life.lastError, `pop=${life?.population}`);
  await page.locator('sonic-button[data-action="play"]').click({timeout: 3000});
  await page.waitForTimeout(6000);
  life = await storeState(page, "life");
  const seq = await state(page, "seq");
  const pluck = await state(page, "pluck");
  const kit = await state(page, "kit");
  const spectre = await state(page, "spectre");
  check("séquenceur en lecture", seq?.playing === true && seq.errors.length === 0 && seq.warnings.length === 0, JSON.stringify(seq));
  check("mode store : générations qui avancent", life?.gen >= 2 && !life.lastError, `gen=${life?.gen} err=${life?.lastError}`);
  check("notes calculées par le reducer jouées", pluck?.played > 10, `played=${pluck?.played}`);
  check("mode direct : kit joué par le motif", kit?.played > 10, `played=${kit?.played}`);
  check("analyseur du master actif", spectre?.status === "ready" && spectre.rms > 0.01 && spectre.bands.length === 8, `rms=${spectre?.rms}`);
  const tex = await page.evaluate(() => {
    const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
    const a = deep(document, "sonic-audio-analyser")[0];
    const c = deep(document, "sonic-shader")[0]?.shadowRoot?.querySelector("canvas");
    return {frames: a?.frameSeq ?? 0, webgl: !!c && c.width > 0};
  });
  check("texture du spectre lue par sonic-shader (Concorde)", tex.frames > 100 && tex.webgl, JSON.stringify(tex));
  await page.locator('sonic-button[data-action="faster"]').click();
  await page.waitForTimeout(500);
  check("tempo piloté par le store", (await state(page, "seq"))?.bpm === 106);
  await page.locator('sonic-button[data-action="play"]').click();
  await page.waitForTimeout(400);
  check("arrêt", (await state(page, "seq"))?.playing === false);
  check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 300));
  await page.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
