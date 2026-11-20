/**
 * Smoke test des addons serial et grbl de creative-stack (sonic-serial, sonic-gcode, sonic-grbl) dans le viewer.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : CHROME_PATH=…/chrome node scripts/smoke-laser.mjs
 *
 * Sert dist/ avec la CSP et la Permissions-Policy de prod + une fausse API publique
 * (tests/fixtures/laser.json, et un document qui utilise sonic-serial sans le déclarer).
 * Web Serial factice : une machine GRBL 1.1 qui répond comme la vraie et garde tout ce qu'on lui écrit.
 * Vérifie : bandeau, aucune demande au chargement, programme et aperçu construits depuis le SVG,
 * connexion au clic (filtre CH340, 115200 bauds), version et réglages lus, tâche envoyée au clic
 * (gravure puis découpe, M4, fin par M5 et temporisation), refus d'un document non déclaré,
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
  laser: JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/laser.json"), "utf8")),
  "serie-non-declaree": {
    schema: "artifacts/1", title: "Port série non déclaré", defaultView: "v",
    views: [{id: "v", title: "v", root: {nodes: [{tagName: "sonic-serial", attributes: {id: "p", profile: "ch340"}}]}}],
  },
};
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; media-src 'self' https: blob: data:; connect-src 'self' https: blob:; worker-src 'self' blob: https://cdn.jsdelivr.net; child-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const PERMISSIONS = "camera=(self), microphone=(self), midi=(self), display-capture=(self), bluetooth=(self), serial=(self), geolocation=(self), payment=(), usb=(), browsing-topics=()";

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

/** Machine GRBL factice derrière un pont CH340 : accueil à l'ouverture, `$I`, `$$`, `?`, `ok` à chaque ligne. */
const FAKE_SERIAL = `(() => {
  const lines = [];
  let calls = 0, ctrl = null, pending = "";
  const enc = new TextEncoder(), dec = new TextDecoder();
  const say = (s) => setTimeout(() => ctrl && ctrl.enqueue(enc.encode(s)), 1);
  const port = Object.assign(new EventTarget(), {
    readable: null, writable: null,
    getInfo: () => ({ usbVendorId: 0x1a86, usbProductId: 0x7523 }),
    async open(options) {
      window.__serialOpen = options;
      port.readable = new ReadableStream({ start: (c) => { ctrl = c; } });
      port.writable = new WritableStream({ write(chunk) {
        if (chunk.length === 1 && chunk[0] === 0x3f) return say("<Idle|MPos:0.000,0.000,0.000|FS:0,0>\\r\\n");
        if (chunk.length === 1 && (chunk[0] < 0x20 || chunk[0] > 0x7e || chunk[0] === 0x21 || chunk[0] === 0x7e)) return;
        pending += dec.decode(chunk);
        let at;
        while ((at = pending.indexOf("\\n")) >= 0) {
          const line = pending.slice(0, at).trim();
          pending = pending.slice(at + 1);
          lines.push(line);
          if (line === "$I") say("[VER:1.1h.20190825:]\\r\\n[OPT:V,15,128]\\r\\nok\\r\\n");
          else if (line === "$$") say("$22=0\\r\\n$30=1000\\r\\n$32=1\\r\\n$110=6000\\r\\n$111=6000\\r\\n$130=410.000\\r\\n$131=400.000\\r\\nok\\r\\n");
          else say("ok\\r\\n");
        }
      } });
      say("\\r\\nGrbl 1.1h ['$' for help]\\r\\n");
    },
    async close() { port.readable = null; port.writable = null; ctrl = null; },
  });
  Object.defineProperty(navigator, "serial", { configurable: true, value: Object.assign(new EventTarget(), {
    getPorts: async () => [],
    requestPort: async (options) => { calls++; window.__serialOptions = options; return port; } }) });
  window.__serial = { calls: () => calls, lines };
})();`;

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"]});
const errors = [];
const open = async (slug) => {
  const page = await (await browser.newContext({viewport: {width: 900, height: 1000}})).newPage();
  await page.addInitScript({content: FAKE_SERIAL});
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused|Permissions policy|sonic-/i.test(m.text())) errors.push(m.text()); });
  await page.goto(`http://localhost:${PORT}/${slug}?k=tok`);
  await page.waitForTimeout(2500);
  return page;
};

let page = await open("laser");
check("pas de bandeau d'avertissement (la permission est demandée au clic)", (await page.locator(".artifact-capabilities").count()) === 0);
let port = await state(page, "port");
check("aucune demande de port au chargement", (await page.evaluate(() => __serial.calls())) === 0 && port?.status === "idle" && port.supported === true, JSON.stringify({status: port?.status, supported: port?.supported, allowed: port?.allowed}));
check("Permissions-Policy : serial autorisé", port?.allowed !== false, String(port?.allowed));

let prog = await state(page, "prog");
check("programme construit depuis le SVG : 30 x 30 mm, gravure et découpe", prog?.ready === true && prog.kind === "vector" && prog.sizeMm?.w === 30 && prog.bbox?.w === 30 && prog.bbox.h === 30 && prog.lines > 20 && prog.estimateS > 0, JSON.stringify({status: prog?.status, error: prog?.error, lines: prog?.lines, bbox: prog?.bbox, estimateS: prog?.estimateS}));
const shown = await page.evaluate(() => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  const c = deep(document, "#prog")[0].shadowRoot.querySelector("canvas");
  if (!c) return null;
  const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] < 200) dark++;
  return {w: c.width, h: c.height, dark, visible: c.getBoundingClientRect().width};
});
check("aperçu des parcours affiché", shown && shown.dark > 500 && shown.visible > 100, JSON.stringify(shown));

await page.locator("sonic-button#connecter").click({timeout: 3000});
await page.waitForTimeout(1500);
port = await state(page, "port");
const asked = await page.evaluate(() => ({options: window.__serialOptions, open: window.__serialOpen}));
check("connexion au clic : filtre CH340, 115200 bauds", port?.connected === true && asked.options?.filters?.[0]?.usbVendorId === 0x1a86 && asked.open?.baudRate === 115200 && port.port?.name === "CH340 1a86:7523", JSON.stringify({connected: port?.connected, asked, error: port?.error}));
let laser = await state(page, "laser");
check("machine reconnue : version, réglages, zone de l'A5 Pro, au repos", laser?.status === "ready" && laser.firmware === "1.1h.20190825" && laser.laserMode === true && laser.maxS === 1000 && laser.area?.x === 410 && laser.area.y === 400 && laser.machineState === "Idle", JSON.stringify({status: laser?.status, fw: laser?.firmware, laserMode: laser?.laserMode, area: laser?.area, state: laser?.machineState, error: laser?.error}));

await page.evaluate(() => { __serial.lines.length = 0; });
await page.locator("sonic-button#lancer").click({timeout: 3000});
await page.waitForTimeout(2500);
laser = await state(page, "laser");
check("tâche terminée", laser?.jobs === 1 && laser.job === null && laser.error === null, JSON.stringify({jobs: laser?.jobs, job: laser?.job, error: laser?.error}));
const sent = await page.evaluate(() => __serial.lines);
check("début : absolu, millimètres, faisceau coupé, puissance dynamique", sent.slice(0, 4).join(",") === "G90,G21,M5,M4S0", sent.slice(0, 4).join(","));
const firstCut = sent.findIndex((l) => l.includes("S800"));
const lastFill = sent.map((l) => l.includes("S200")).lastIndexOf(true);
check("gravure (S200) avant découpe (S800 à 400 mm/min)", lastFill > 0 && firstCut > lastFill && sent[firstCut].endsWith("S800F400"), `${sent[lastFill]} … ${sent[firstCut]}`);
check("jamais de M3, aucune commande $", !sent.some((l) => /M0*3(?!\d)/.test(l) || l.startsWith("$")), sent.filter((l) => l.startsWith("$") || /M3/.test(l)).join(","));
check("fin : M5, retour, M5 et temporisation de fin", sent.slice(-4).join(",") === "M5,G0X0Y0,M5,G4P0.01", sent.slice(-4).join(","));

page = await open("serie-non-declaree");
const refused = await page.evaluate(() => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  return deep(document, "artifact-viewer")[0]?.shadowRoot?.textContent ?? "";
});
check("sonic-serial non déclaré refusé, aucune demande", /Document refusé/.test(refused) && /"serial"/.test(refused) && (await page.evaluate(() => __serial.calls())) === 0, refused.replace(/\s+/g, " ").slice(0, 160));

check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
