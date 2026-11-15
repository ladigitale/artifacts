/**
 * Smoke test de l'addon bluetooth de creative-stack (sonic-bluetooth, sonic-label-printer) dans le viewer.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : CHROME_PATH=…/chrome node scripts/smoke-bluetooth.mjs
 *
 * Sert dist/ avec la CSP et la Permissions-Policy de prod + une fausse API publique
 * (tests/fixtures/etiquette.json, et un document qui utilise sonic-bluetooth sans le déclarer).
 * Web Bluetooth factice : une imprimante Fichero (AiYin D11s) qui répond comme la vraie et garde
 * tout ce qu'on lui écrit. Vérifie : bandeau, aucune demande au chargement, connexion au clic
 * (filtres du profil luck), modèle et batterie lus, aperçu 1 bit, impression au clic (séquence et
 * points exacts de l'image), refus d'un document non déclaré, aucune erreur JS / CSP.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const fixtures = {
  etiquette: JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/etiquette.json"), "utf8")),
  "bluetooth-non-declare": {
    schema: "artifacts/1", title: "Bluetooth non déclaré", defaultView: "v",
    views: [{id: "v", title: "v", root: {nodes: [{tagName: "sonic-bluetooth", attributes: {id: "b", profile: "luck"}}]}}],
  },
};
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; media-src 'self' https: blob: data:; connect-src 'self' https: blob:; worker-src 'self' blob: https://cdn.jsdelivr.net; child-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const PERMISSIONS = "camera=(self), microphone=(self), midi=(self), display-capture=(self), bluetooth=(self), geolocation=(), payment=(), usb=(), browsing-topics=()";

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

/** Imprimante Fichero factice : service 18f0, écriture 2af1, notifications 2af0. */
const FAKE_BLUETOOTH = `(() => {
  const uuid = (s) => "0000" + s + "-0000-1000-8000-00805f9b34fb";
  const writes = [];
  let calls = 0;
  const rx = Object.assign(new EventTarget(), { uuid: uuid("2af0"), value: null, properties: { notify: true },
    startNotifications: async () => {}, stopNotifications: async () => {}, readValue: async () => new DataView(new ArrayBuffer(0)) });
  const answer = (bytes) => setTimeout(() => { rx.value = new DataView(Uint8Array.from(bytes).buffer); rx.dispatchEvent(new Event("characteristicvaluechanged")); }, 1);
  const tx = Object.assign(new EventTarget(), { uuid: uuid("2af1"), properties: { write: true, writeWithoutResponse: true },
    async writeValueWithoutResponse(data) {
      const b = Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      writes.push(b);
      const hex = b.map((x) => x.toString(16).padStart(2, "0")).join("");
      if (hex === "10ff20f0") answer([0x44, 0x31, 0x31, 0x73]);
      else if (hex === "10ff20f1") answer([0x32, 0x2e, 0x34, 0x2e, 0x36]);
      else if (hex === "10ff50f1") answer([0x00, 0x56]);
      else if (hex === "10ff40") answer([0x00]);
      else if (hex.startsWith("10ff10") || hex.startsWith("10ff84")) answer([0x4f, 0x4b]);
      else if (hex === "10fffe45") answer([0xaa]);
    } });
  const service = { uuid: uuid("18f0"), getCharacteristics: async () => [tx, rx], getCharacteristic: async (c) => [tx, rx].find((x) => x.uuid === c) };
  const device = Object.assign(new EventTarget(), { id: "fichero", name: "FICHERO_5836" });
  device.gatt = { connected: false, async connect() { this.connected = true; return this; }, disconnect() { this.connected = false; device.dispatchEvent(new Event("gattserverdisconnected")); },
    async getPrimaryService(u) { if (u !== service.uuid) throw new DOMException("absent", "NotFoundError"); return service; } };
  Object.defineProperty(navigator, "bluetooth", { configurable: true, value: {
    getAvailability: async () => true,
    requestDevice: async (options) => { calls++; window.__btOptions = options; return device; } } });
  window.__bt = { calls: () => calls, writes };
})();`;

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"]});
const errors = [];
const open = async (slug) => {
  const page = await (await browser.newContext({viewport: {width: 900, height: 1000}})).newPage();
  await page.addInitScript({content: FAKE_BLUETOOTH});
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused|Permissions policy|sonic-/i.test(m.text())) errors.push(m.text()); });
  await page.goto(`http://localhost:${PORT}/${slug}?k=tok`);
  await page.waitForTimeout(2500);
  return page;
};

let page = await open("etiquette");
const banner = await page.locator(".artifact-capabilities").textContent().catch(() => "");
check("bandeau : appareil Bluetooth", /appareil Bluetooth/.test(banner ?? ""), banner?.trim());
let bt = await state(page, "bt");
check("aucune demande Bluetooth au chargement", (await page.evaluate(() => __bt.calls())) === 0 && bt?.status === "idle" && bt.supported === true, JSON.stringify({status: bt?.status, supported: bt?.supported, allowed: bt?.allowed}));
check("Permissions-Policy : bluetooth autorisé", bt?.allowed !== false, String(bt?.allowed));

let imp = await state(page, "imp");
check("aperçu 1 bit avant toute connexion : 240 x 96, moitié noire", imp?.preview?.width === 240 && imp.preview.height === 96 && Math.abs(imp.preview.ink - 0.5) < 0.02, JSON.stringify(imp?.preview));
const shown = await page.evaluate(() => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  const el = deep(document, "#imp")[0];
  const c = el.shadowRoot.querySelector("canvas");
  if (!c) return null;
  const px = (x, y) => Array.from(c.getContext("2d").getImageData(x, y, 1, 1).data);
  return {w: c.width, h: c.height, left: px(10, 48), right: px(230, 48), visible: c.getBoundingClientRect().width};
});
check("aperçu affiché (show-preview) : noir à gauche, blanc à droite", shown?.left?.[0] === 0 && shown.right[0] === 255 && shown.visible > 100, JSON.stringify(shown));

await page.locator("sonic-button#connecter").click({timeout: 3000});
await page.waitForTimeout(1500);
bt = await state(page, "bt");
const asked = await page.evaluate(() => window.__btOptions);
check("connexion au clic, filtres du profil luck", bt?.connected === true && bt.device?.name === "FICHERO_5836" && asked?.filters?.[0]?.namePrefix === "FICHERO" && asked.optionalServices?.[0]?.startsWith("000018f0"), JSON.stringify({connected: bt?.connected, asked}));
imp = await state(page, "imp");
check("imprimante reconnue : D11s, micrologiciel, batterie, tête 96 points", imp?.status === "ready" && imp.model === "D11s" && imp.firmware === "2.4.6" && imp.battery === 86 && imp.head?.widthPx === 96 && imp.protocol === "luck-aiyin", JSON.stringify({status: imp?.status, model: imp?.model, fw: imp?.firmware, battery: imp?.battery, head: imp?.head, error: imp?.error}));

await page.evaluate(() => { __bt.writes.length = 0; });
await page.locator("sonic-button#imprimer").click({timeout: 3000});
await page.waitForTimeout(2500);
imp = await state(page, "imp");
check("impression terminée", imp?.jobs === 1 && imp.printing === false && imp.error === null && imp.progress === 1, JSON.stringify({jobs: imp?.jobs, printing: imp?.printing, error: imp?.error, progress: imp?.progress}));
const sent = await page.evaluate(() => __bt.writes);
const hex = (b) => b.map((x) => x.toString(16).padStart(2, "0")).join("");
// Le raster part en morceaux de 200 octets : on recolle tout ce qui suit l'en-tête jusqu'à l'avance papier.
const start = sent.findIndex((w) => hex(w.slice(0, 8)) === "1d7630000c00f000");
const end = sent.findIndex((w, i) => i > start && hex(w) === "1d0c");
const before = sent.slice(0, start).map(hex);
check("séquence : état, densité, papier, réveil, activation", before.join(",") === "10ff40,10ff100001,10ff8400,000000000000000000000000,10fffe01", before.join(","));
const raster = start >= 0 && end > start ? sent.slice(start, end).flat().slice(8) : [];
check("raster : 2880 octets en morceaux de 200 au plus", raster.length === 2880 && sent.slice(start, end).every((w) => w.length <= 200), `${raster.length} octets, ${end - start} morceaux`);
const row = (y) => raster.slice(y * 12, y * 12 + 12);
const all = (y, v) => row(y).every((b) => b === v);
check("points exacts : moitié gauche du dessin = 120 premières lignes noires", all(0, 0xff) && all(60, 0xff) && all(117, 0xff) && all(122, 0x00) && all(239, 0x00), `ligne 0 ${hex(row(0))}, ligne 239 ${hex(row(239))}`);
check("fin : avance puis arrêt", hex(sent[end]) === "1d0c" && hex(sent[end + 1]) === "10fffe45" && sent.length === end + 2, sent.slice(end).map(hex).join(","));

page = await open("bluetooth-non-declare");
const refused = await page.evaluate(() => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  return deep(document, "artifact-viewer")[0]?.shadowRoot?.textContent ?? "";
});
check("sonic-bluetooth non déclaré refusé, aucune demande", /Document refusé/.test(refused) && /"bluetooth"/.test(refused) && (await page.evaluate(() => __bt.calls())) === 0, refused.replace(/\s+/g, " ").slice(0, 160));

check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
