/**
 * Smoke test de `sonic-morse` (creative-stack, addon media) dans le viewer Artefacts.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : CHROME_PATH=…/chrome node scripts/smoke-morse.mjs
 *
 * Fixture `morse-torche` : chat en morse entre deux téléphones (torche → caméra).
 * Caméra factice = vidéo générée ici, qui clignote « SOS » en morse (point de 300 ms) puis se
 * tait : la sonde (detect="jump") voit les fronts, sonic-morse les décode, le message arrive
 * dans le fil. Puis on envoie « é t » : le composant séquence la torche (absente de la caméra
 * factice, ce que le store note) et le message part dans le fil.
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/morse-torche.json"), "utf8"));
// Comme l'API : les références "@file:nom" sont remplacées par le contenu de files avant l'affichage.
const doc = JSON.parse(JSON.stringify(raw, (k, v) => (typeof v === "string" && v.startsWith("@file:") ? (raw.files?.[v.slice(6)] ?? v) : v)));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; media-src 'self' https: blob: data:; connect-src 'self' https: blob:; worker-src 'self' blob: https://cdn.jsdelivr.net; child-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const PERMISSIONS = "camera=(self), microphone=(self), midi=(self), display-capture=(self), geolocation=(self), payment=(), usb=(), browsing-topics=()";

/** Vidéo Y4M 80×60 à 30 i/s : « SOS » en morse (point = 9 images = 300 ms), puis 22 unités de noir, en boucle. */
function morseVideo() {
  const W = 80, H = 60, UNIT = 9, file = path.join(os.tmpdir(), "smoke-morse-sos.y4m");
  const letters = ["...", "---", "..."];
  const units = [];
  letters.forEach((l, i) => {
    [...l].forEach((s, j) => {
      units.push(...Array(s === "-" ? 3 : 1).fill(1));
      if (j < l.length - 1) units.push(0);
    });
    if (i < letters.length - 1) units.push(0, 0, 0);
  });
  units.push(...Array(22).fill(0));
  const parts = [Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\n`)];
  const chroma = Buffer.alloc((W / 2) * (H / 2) * 2, 128);
  for (const u of units) for (let i = 0; i < UNIT; i++) parts.push(Buffer.from("FRAME\n"), Buffer.alloc(W * H, u ? 235 : 16), chroma);
  fs.writeFileSync(file, Buffer.concat(parts));
  return file;
}

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
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
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${morseVideo()}`, "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await (await browser.newContext({viewport: {width: 390, height: 844}})).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused|Permissions policy/i.test(m.text())) errors.push(m.text()); });
await page.goto(`http://localhost:${PORT}/morse-torche?k=tok`);
await page.waitForTimeout(2500);

check("rien ne démarre avant le clic", (await state(page, "cam"))?.status !== "ready");
await page.getByText("Activer la caméra").first().click({timeout: 3000});
await page.waitForTimeout(2000);
check("caméra ouverte par le bouton", (await state(page, "cam"))?.status === "ready");

// La vidéo boucle toutes les 14,7 s : en 40 s, au moins deux « SOS » entiers passent.
let m = null;
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(1000);
  m = await state(page, "morse");
  if (m?.received >= 2) break;
}
const s = await state(page, "sonde");
check("sonde en détection par sauts", s?.settings?.detect === "jump" && s.status === "ready", `fps ${s?.fps}, horloge ${s?.clock}, ${s?.edges} fronts`);
check("message reçu et décodé", m?.lastReceived === "SOS", `reçu « ${m?.lastReceived} », ${m?.received} message(s), unité ${m?.rx?.unit}`);
check("message dans le fil", /SOS/.test(await text(page)));
await page.screenshot({path: path.join(os.tmpdir(), "smoke-morse-rx.png")});

await page.locator("sonic-input input").fill("é t");
await page.locator("sonic-button", {hasText: "Envoyer"}).click({timeout: 3000});
await page.waitForTimeout(600);
m = await state(page, "morse");
check("émission lancée par le bouton", m?.status === "sending" && m.tx.text === "E T", `${m?.status} « ${m?.tx?.text} » ${m?.tx?.signs}`);
check("le fil montre le message envoyé, le champ est vidé", /é t/.test(await text(page)) && (await page.locator("sonic-input input").inputValue()) === "");
const chat = await page.evaluate(() => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  return JSON.parse(JSON.stringify(deep(document, "sonic-store#chat")[0]?.state ?? null));
});
check("torche absente de la caméra factice signalée", /Pas de torche/.test(chat?.notice ?? ""), chat?.notice);
check("l'état du chat reste propre (pas de métadonnées de liste)", (chat?.messages ?? []).every((x) => Object.keys(x).join() === "id,who,text"), JSON.stringify(chat?.messages));
await page.screenshot({path: path.join(os.tmpdir(), "smoke-morse-tx.png")});
await page.waitForTimeout(4500); // E (1) + mot (7) + T (3) + 3 = 14 unités = 4,2 s
m = await state(page, "morse");
check("émission terminée", m?.status !== "sending" && m.sent === 1 && m.lastSent === "E T" && m.on === false, `${m?.status}, ${m?.sent} envoyé(s)`);
check("aucune erreur JS / CSP / permissions", errors.length === 0, errors.join(" | ").slice(0, 300));

await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nOK");
process.exit(failures ? 1 : 0);
