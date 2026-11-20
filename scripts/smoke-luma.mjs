/**
 * Smoke test de `sonic-luma` (creative-stack, addon media) dans le viewer Artefacts.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : CHROME_PATH=…/chrome node scripts/smoke-luma.mjs
 *
 * Fixture `banc-torche` : un store commande la torche d'une sonic-camera (DP adjust), la sonde
 * mesure la luminosité de la caméra et envoie ses fronts au store, qui calcule les délais.
 * Caméra factice = fichier vidéo généré ici, noir puis blanc toutes les 500 ms : la sonde doit
 * voir des fronts espacés de 500 ms. La caméra factice n'a pas de torche : les délais mesurés
 * n'ont pas de sens, on vérifie seulement que le parcours va au bout et publie sa sortie sur un
 * run serveur simulé (`?run=&rt=`).
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/banc-torche.json"), "utf8"));
// Comme l'API : les références "@file:nom" sont remplacées par le contenu de files avant l'affichage.
const doc = JSON.parse(JSON.stringify(raw, (k, v) => (typeof v === "string" && v.startsWith("@file:") ? (raw.files?.[v.slice(6)] ?? v) : v)));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; media-src 'self' https: blob: data:; connect-src 'self' https: blob:; worker-src 'self' blob: https://cdn.jsdelivr.net; child-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const PERMISSIONS = "camera=(self), microphone=(self), midi=(self), display-capture=(self), geolocation=(self), payment=(), usb=(), browsing-topics=()";

/** Vidéo Y4M 160×120 à 30 i/s : 15 images noires puis 15 blanches, en boucle. */
function blinkVideo() {
  const W = 160, H = 120, file = path.join(os.tmpdir(), "smoke-luma-blink.y4m");
  const parts = [Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\n`)];
  const chroma = Buffer.alloc((W / 2) * (H / 2) * 2, 128);
  for (let i = 0; i < 90; i++) {
    parts.push(Buffer.from("FRAME\n"), Buffer.alloc(W * H, Math.floor(i / 15) % 2 ? 235 : 16), chroma);
  }
  fs.writeFileSync(file, Buffer.concat(parts));
  return file;
}

const RUN = "11111111-2222-4333-8444-555555555555";
const cors = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS"};
const posts = [];

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  if (q.method === "OPTIONS") {
    r.writeHead(204, cors);
    return r.end();
  }
  const run = /^\/api\/public\/artifacts\/banc-torche\/runs\/([0-9a-f-]{36})(\/output)?$/.exec(u.pathname);
  if (run) {
    if (q.method === "POST") {
      let body = "";
      q.on("data", (c) => (body += c));
      q.on("end", () => {
        posts.push(JSON.parse(body));
        r.writeHead(200, {"Content-Type": "application/json", ...cors});
        r.end(JSON.stringify({runId: run[1], status: "completed"}));
      });
      return;
    }
    r.writeHead(200, {"Content-Type": "application/json", ...cors});
    return r.end(JSON.stringify({runId: RUN, slug: "banc-torche", mode: "interactive", status: "pending", input: {appareil: "caméra factice"}}));
  }
  const m = /^\/api\/public\/artifacts\/([^/]+)/.exec(u.pathname);
  if (m) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
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
const text = (p) => p.evaluate(() => {
  const deep = (r, a = []) => { r.childNodes.forEach((n) => { if (n.nodeType === 3) a.push(n.textContent); else if (n.nodeType === 1) { if (n.shadowRoot) deep(n.shadowRoot, a); deep(n, a); } }); return a; };
  return deep(document.body).join(" ").replace(/\s+/g, " ");
});

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${blinkVideo()}`, "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await (await browser.newContext()).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused|Permissions policy/i.test(m.text())) errors.push(m.text()); });
await page.goto(`http://localhost:${PORT}/banc-torche?k=tok&run=${RUN}&rt=tok`);
await page.waitForTimeout(2500);

check("sonde en attente avant tout geste", (await state(page, "sonde"))?.status === "idle", JSON.stringify((await state(page, "cam"))?.status));
await page.locator("sonic-button", {hasText: "Lancer la mesure"}).click({timeout: 3000});
await page.waitForTimeout(4000);

const cam = await state(page, "cam");
check("caméra ouverte par le clic", cam?.status === "ready", `${cam?.status} ${cam?.width}×${cam?.height}`);
const s = await state(page, "sonde");
check("sonde prête, images analysées", s?.status === "ready" && s.fps > 10, `fps ${s?.fps}, horloge ${s?.clock}`);
check("signal lisible : noir et blanc bien séparés", s?.signal === true && s.contrast > 0.5, `lo ${s?.lo} hi ${s?.hi}`);
check("fronts détectés", s?.edges >= 4, `${s?.edges} fronts`);
const durs = (s?.events ?? []).slice(1).map((e) => e.dur);
check("fronts espacés de 500 ms", durs.length >= 3 && durs.every((d) => Math.abs(d - 500) < 70), durs.map((d) => Math.round(d)).join(" "));
check("fronts alternés", (s?.events ?? []).every((e, i, a) => i === 0 || e.on !== a[i - 1].on));

let last = "";
for (let i = 0; i < 80 && !posts.length; i++) {
  await page.waitForTimeout(1000);
  const t = await text(page);
  const m = /Mesure \d+ \/ \d+/.exec(t);
  if (m && m[0] !== last) last = m[0];
}
check("le store déroule ses mesures", /Mesure \d+ \/ 80/.test(last), last);
const output = posts[0]?.output ?? null;
check("sortie publiée une fois sur le run", posts.length === 1 && posts[0].rt === "tok" && typeof output?.verdict === "string", JSON.stringify(output)?.slice(0, 400));
check("entrée du run rangée dans l'état", output?.appareil === "caméra factice", output?.appareil);
check("délais relevés par mark-from", (output?.latOn?.length ?? 0) >= 3 && (output?.latOff?.length ?? 0) >= 3, `${output?.latOn?.length} allumages, ${output?.latOff?.length} extinctions`);
check("impulsions courtes relevées", (output?.pulses ?? []).some((p) => p.seen > 0), (output?.pulses ?? []).map((p) => `${p.d}:${p.seen}`).join(" "));
check("torche absente de la caméra factice signalée", typeof output?.torchError === "string" && output.torchError !== "", output?.torchError);
check("aucune erreur JS / CSP / permissions", errors.length === 0, errors.join(" | ").slice(0, 300));

await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nOK");
process.exit(failures ? 1 : 0);
