/**
 * Smoke test de l'addon creative-stack `media` (et du micro) dans le viewer Artefacts.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-media.mjs
 *
 * Sert dist/ avec la CSP et la Permissions-Policy de prod + une fausse API publique
 * (tests/fixtures/miroir.json, clip-reactif.json, et un document qui utilise la caméra
 * sans la déclarer). Chromium avec caméra et micro factices. Vérifie : bandeau des
 * capacités, aucune demande au chargement, caméra au clic, effet et photo pilotés par le
 * store, image lue par le sonic-shader de Concorde, vidéo + analyseur + shader, boucle
 * et vitesse par le store, refus d'un document non déclaré, aucune erreur JS / CSP.
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
  miroir: fx("miroir.json"),
  "clip-reactif": fx("clip-reactif.json"),
  "camera-non-declaree": {
    schema: "artifacts/1", title: "Caméra non déclarée", defaultView: "v",
    views: [{id: "v", title: "v", root: {nodes: [{tagName: "sonic-camera", attributes: {id: "c"}}]}}],
  },
};
const CLIP = path.join(ROOT, "tests/fixtures/clip.webm");
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; media-src 'self' https: blob: data:; connect-src 'self' https: blob:; worker-src 'self' blob: https://cdn.jsdelivr.net; child-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const PERMISSIONS = "camera=(self), microphone=(self), geolocation=(), payment=()";

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
  if (u.pathname === "/media/clip.webm") {
    const size = fs.statSync(CLIP).size;
    const range = /bytes=(\d+)-(\d*)/.exec(q.headers.range ?? "");
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Number(range[2]) : size - 1;
      r.writeHead(206, {"Content-Type": "video/webm", "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1});
      return fs.createReadStream(CLIP, {start, end}).pipe(r);
    }
    r.writeHead(200, {"Content-Type": "video/webm", "Accept-Ranges": "bytes", "Content-Length": size});
    return fs.createReadStream(CLIP).pipe(r);
  }
  let f = path.join(DIST, u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  const t = f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".svg") ? "image/svg+xml" : "text/html";
  r.writeHead(200, {"Content-Type": t, "Content-Security-Policy": CSP, "Permissions-Policy": PERMISSIONS});
  r.end(fs.readFileSync(f));
}).listen(PORT);

let failures = 0;
const check = (label, ok, detail = "") => { console.log(`${ok ? "✔" : "✘"} ${label}${detail ? "  — " + detail : ""}`); if (!ok) failures++; };

const deepQuery = (p, sel) => p.evaluate((sel) => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  return deep(document, sel).length;
}, sel);
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
const consumers = (p, id) => p.evaluate((id) => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  const el = deep(document, `#${id}`)[0];
  return el?.frames?.consumers?.size ?? -1;
}, id);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});

async function open(slug) {
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  let gum = 0;
  await page.exposeFunction("__gumCalled", () => gum++);
  await page.addInitScript(() => {
    const md = navigator.mediaDevices;
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = (c) => { window.__gumCalled(); return orig(c); };
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused|Permissions policy/i.test(m.text())) errors.push(m.text()); });
  await page.goto(`http://localhost:${PORT}/${slug}?k=tok`);
  await page.waitForTimeout(2500);
  return {page, errors, gum: () => gum};
}

console.log("\n== miroir");
{
  const {page, errors, gum} = await open("miroir");
  const notice = await page.evaluate(() => {
    const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
    return deep(document, ".artifact-capabilities")[0]?.textContent?.trim() ?? "";
  });
  check("bandeau : l'artefact peut demander la caméra", /la caméra/.test(notice), notice.slice(0, 80));
  check("aucune demande d'accès au chargement", gum() === 0 && (await state(page, "cam"))?.status === "idle");
  await page.locator("sonic-media-start").locator("button").click({timeout: 3000});
  await page.waitForTimeout(1500);
  let cam = await state(page, "cam");
  check("caméra au clic (Permissions-Policy camera=(self))", cam?.status === "ready" && cam.width > 0, `${cam?.status} ${cam?.width}×${cam?.height}`);
  check("sonic-shader de Concorde abonné à #cam", (await consumers(page, "cam")) === 1);
  await page.locator('sonic-button[data-action="fx-2"]').click();
  await page.locator('sonic-button[data-action="snap"]').click();
  await page.waitForTimeout(800);
  cam = await state(page, "cam");
  const miroir = await storeState(page, "miroir");
  check("effet choisi par le store", miroir?.param0 === 2 && miroir.fxName === "Thermique");
  check("photo par compteur", cam?.snapshots === 1 && /^blob:/.test(cam.snapshot?.url ?? ""), JSON.stringify(cam?.snapshot)?.slice(0, 80));
  check("aucune erreur JS / CSP / permissions", errors.length === 0, errors.join(" | ").slice(0, 300));
  await page.close();
}

console.log("\n== clip-reactif");
{
  const {page, errors} = await open("clip-reactif");
  check("pas de bandeau sans capacité déclarée", (await deepQuery(page, ".artifact-capabilities")) === 0);
  await page.locator("sonic-media-start").locator("button").click({timeout: 3000});
  await page.waitForTimeout(2500);
  const clip = await state(page, "clip");
  const sp = await state(page, "spectre");
  check("vidéo lancée au clic, avec son", clip?.status === "playing" && !clip.muted && clip.durationS > 7.9, JSON.stringify({s: clip?.status, m: clip?.muted, d: clip?.durationS}));
  check("son de la vidéo analysé", sp?.status === "ready" && sp.rms > 0.01 && sp.onsetCount >= 1, `rms=${sp?.rms} attaques=${sp?.onsetCount}`);
  check("shader de Concorde abonné à #clip", (await consumers(page, "clip")) === 1);
  await page.locator('sonic-button[data-action="loop"]').click();
  await page.waitForTimeout(2600);
  const t = (await state(page, "clip"))?.timeS;
  check("boucle 2–4 s pilotée par le store", t >= 1.9 && t <= 4.2, `t=${t}`);
  await page.locator('sonic-button[data-action="rate-0.5"]').click();
  await page.waitForTimeout(300);
  check("vitesse ×0,5", (await state(page, "clip"))?.rate === 0.5);
  await page.locator('sonic-button[data-action="toggle"]').click();
  await page.waitForTimeout(300);
  check("pause", (await state(page, "clip"))?.status === "paused");
  check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 300));
  await page.close();
}

console.log("\n== caméra non déclarée");
{
  const {page, errors, gum} = await open("camera-non-declaree");
  const text = await page.evaluate(() => {
    const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
    return deep(document, "artifact-viewer")[0]?.shadowRoot?.textContent ?? "";
  });
  check("document refusé : capacité manquante", /Document refusé/.test(text) && /capabilities/.test(text), text.replace(/\s+/g, " ").slice(0, 120));
  check("aucun accès demandé", gum() === 0 && errors.length === 0);
  await page.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
