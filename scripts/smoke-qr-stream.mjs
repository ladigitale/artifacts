/**
 * Smoke test du flux de QR codes animés (creative-stack, addon qr) dans le viewer Artefacts :
 * `sonic-qr-reader`, `sonic-qr-receiver`, `sonic-qr-sender`.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 *             npm i --prefix /tmp/qr-pkg jsqr@1.4.0   (décodeur de repli ; QR_PKG pour un autre dossier)
 * Lancer   : CHROME_PATH=…/chrome node scripts/smoke-qr-stream.mjs
 *
 * Fixture `photo-qr` : une photo passe de l'écran d'un téléphone à la caméra d'un autre.
 * - Réception : la caméra factice filme un vrai flux de QR codes (une petite image PNG découpée en
 *   trames, dessinées ici avec uqr) ; le lecteur les décode dans les pixels (décodeur de repli :
 *   Chrome sur Linux n'a pas de détecteur de QR ; jsDelivr est simulé depuis QR_PKG, empreinte
 *   d'intégrité vérifiée par le navigateur), le récepteur rassemble le fichier à l'octet près.
 * - Émission : une photo de la caméra est réduite, découpée et affichée en QR ; les trames
 *   publiées sont rassemblées ici et redonnent un JPEG complet.
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import {chromium} from "playwright";
import {encode} from "uqr";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const PKG = process.env.QR_PKG ?? "/tmp/qr-pkg";
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/photo-qr.json"), "utf8"));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; media-src 'self' https: blob: data:; connect-src 'self' https: blob:; worker-src 'self' blob: https://cdn.jsdelivr.net; child-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const PERMISSIONS = "camera=(self), microphone=(self), midi=(self), display-capture=(self), geolocation=(self), payment=(), usb=(), browsing-topics=()";

/** PNG 16×16 en couleurs vraies, au contenu peu compressible (≈ 800 octets). */
function png() {
  const W = 16, H = 16, raw = Buffer.alloc((W * 3 + 1) * H);
  let seed = 12345;
  for (let y = 0; y < H; y++) for (let x = 0; x < W * 3; x++) raw[y * (W * 3 + 1) + 1 + x] = (seed = (seed * 1103515245 + 12345) >>> 0) >>> 24;
  const crcTable = Array.from({length: 256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const fnv = (b) => { let h = 0x811c9dc5; for (const v of b) { h ^= v; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, "0"); };

/** Trames du flux, écrites ici sans le code de creative-stack : vérifie aussi le format. */
function frames(bytes, mime, name, chunk, id) {
  const n = Math.ceil(bytes.length / chunk) + 1;
  const out = [`QS1|${id}|0|${n}|${Buffer.from(JSON.stringify({m: mime, n: name, s: bytes.length, h: fnv(bytes)})).toString("base64")}`];
  for (let i = 1; i < n; i++) out.push(`QS1|${id}|${i}|${n}|${bytes.subarray((i - 1) * chunk, i * chunk).toString("base64")}`);
  return out;
}

/** Vidéo Y4M 360×360 à 30 i/s : chaque trame en QR code pendant 4 images (7,5 trames/s), en boucle. */
function qrVideo(texts) {
  const S = 360, file = path.join(os.tmpdir(), "smoke-qr-stream.y4m");
  const parts = [Buffer.from(`YUV4MPEG2 W${S} H${S} F30:1 Ip A1:1 C420jpeg\n`)];
  const chroma = Buffer.alloc((S / 2) * (S / 2) * 2, 128);
  for (const t of texts) {
    const q = encode(t, {ecc: "L", border: 3});
    const px = Math.floor(S / q.size), off = Math.floor((S - px * q.size) / 2);
    const luma = Buffer.alloc(S * S, 235);
    for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.data[y][x]) {
      for (let dy = 0; dy < px; dy++) luma.fill(16, (off + y * px + dy) * S + off + x * px, (off + y * px + dy) * S + off + (x + 1) * px);
    }
    for (let i = 0; i < 4; i++) parts.push(Buffer.from("FRAME\n"), luma, chroma);
  }
  fs.writeFileSync(file, Buffer.concat(parts));
  return file;
}

const image = png();
const stream = frames(image, "image/png", "essai.png", 110, "sm0k");

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

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${qrVideo(stream)}`, "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await (await browser.newContext({viewport: {width: 390, height: 844}})).newPage();
const errors = [];
const cdn = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused|Permissions policy|integrity/i.test(m.text())) errors.push(m.text()); });
await page.route("https://cdn.jsdelivr.net/**", (route) => {
  const u = new URL(route.request().url());
  cdn.push(u.pathname);
  const m = /^\/npm\/jsqr@1\.4\.0\/(.+)$/.exec(u.pathname);
  const f = m ? path.join(PKG, "node_modules/jsqr", m[1]) : null;
  if (!f || !fs.existsSync(f)) return route.fulfill({status: 404, body: "absent"});
  route.fulfill({status: 200, body: fs.readFileSync(f), headers: {"content-type": "text/javascript", "access-control-allow-origin": "*"}});
});
await page.goto(`http://localhost:${PORT}/photo-qr?k=tok`);
await page.waitForTimeout(2500);

// ---- Réception ----
await page.locator("sonic-button", {hasText: "Recevoir"}).click({timeout: 3000});
await page.getByText("Activer la caméra").first().click({timeout: 3000});
let r = null;
let sawProgress = false;
for (let i = 0; i < 80; i++) {
  await page.waitForTimeout(500);
  r = await state(page, "recu");
  if (r?.status === "receiving" && r.received > 0 && r.received < r.total) sawProgress = true;
  if (r?.status === "done" || r?.status === "error") break;
}
const reader = await state(page, "lecteur");
check("lecteur prêt, décodeur de repli chargé avec son empreinte", reader?.status === "ready" && reader.engine === "jsqr" && cdn.includes("/npm/jsqr@1.4.0/dist/jsQR.js"), `${reader?.engine}, ${reader?.rate} analyses/s, ${reader?.ms} ms l'une`);
check("trames lues dans les pixels de la caméra", reader?.count >= stream.length, `${reader?.count} lectures pour ${stream.length} trames`);
check("progression visible pendant la réception", sawProgress);
check("fichier rassemblé et vérifié", r?.status === "done" && r.total === stream.length && r.size === image.length && r.mime === "image/png" && r.name === "essai.png", `${r?.status} ${r?.received}/${r?.total}, ${r?.size} octets en ${r?.seconds} s ${r?.error ?? ""}`);
const same = await page.evaluate(async () => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  const url = deep(document, "#recu")[0]?.getState().file?.url;
  if (!url) return null;
  return Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer()));
});
check("octets reçus identiques à l'image envoyée", same && Buffer.from(same).equals(image));
await page.waitForTimeout(800);
const still = await state(page, "image");
check("image reçue affichée", still?.status === "ready" && still.width === 16 && still.height === 16, JSON.stringify(still));
check("bouton d'enregistrement proposé", await page.getByText("Enregistrer la photo").first().isVisible());
await page.screenshot({path: path.join(os.tmpdir(), "smoke-qr-rx.png")});

// ---- Émission ----
await page.locator("sonic-button", {hasText: "Envoyer"}).first().click({timeout: 3000});
await page.getByText("Prendre la photo et l'envoyer").first().click({timeout: 3000});
let s = null;
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(300);
  s = await state(page, "envoi");
  if (s?.status === "sending" || s?.status === "error") break;
}
check("photo prise, réduite et découpée", s?.status === "sending" && s.mime === "image/jpeg" && s.frames > 2 && s.bytes > 500, `${s?.status} ${s?.bytes} octets, ${s?.frames} trames, tour de ${s?.loopSeconds} s ${s?.error ?? ""}`);
check("lecteur en pause pendant l'émission", (await state(page, "lecteur"))?.active === false);
const got = new Map();
for (let i = 0; i < 400 && got.size < (s?.frames ?? 1); i++) {
  await page.waitForTimeout(60);
  const f = (await state(page, "envoi"))?.frame;
  if (f) got.set(Number(f.split("|")[2]), f);
}
let jpeg = null;
if (got.size === s?.frames) {
  const meta = JSON.parse(Buffer.from(got.get(0).split("|")[4], "base64").toString());
  const body = Buffer.concat(Array.from({length: s.frames - 1}, (_, i) => Buffer.from(got.get(i + 1).split("|")[4], "base64")));
  jpeg = {meta, body, ok: body.length === meta.s && fnv(body) === meta.h};
}
check("trames publiées : un JPEG complet, empreinte juste", jpeg?.ok && jpeg.body[0] === 0xff && jpeg.body[1] === 0xd8 && jpeg.meta.m === "image/jpeg" && jpeg.meta.n === "photo.jpg", `${got.size}/${s?.frames} trames, ${jpeg?.body?.length} octets`);
const longest = Math.max(...[...got.values()].map((f) => f.length));
const qr = await page.evaluate(() => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  const el = deep(document, "sonic-qr")[0];
  const svg = el?.shadowRoot?.querySelector("svg");
  return svg ? {w: Math.round(svg.getBoundingClientRect().width), modules: Number(svg.getAttribute("viewBox")?.split(" ")[2])} : null;
});
check("QR code affiché en grand", qr && qr.w >= 280, `${qr?.w} px, ${qr?.modules} modules de côté, trame la plus longue ${longest} caractères`);
await page.screenshot({path: path.join(os.tmpdir(), "smoke-qr-tx.png")});
check("aucune erreur JS / CSP / permissions / intégrité", errors.length === 0, errors.join(" | ").slice(0, 300));

await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nOK");
process.exit(failures ? 1 : 0);
