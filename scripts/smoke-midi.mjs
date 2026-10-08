/**
 * Smoke test de la phase 5 de creative-stack (MIDI, capture d'écran) dans le viewer.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-media.mjs
 *
 * Sert dist/ avec la CSP et la Permissions-Policy de prod + une fausse API publique
 * (tests/fixtures/jam-midi.json, ecran.json, et un document qui utilise sonic-midi sans
 * le déclarer). Web MIDI factice (entrée « LinnStrument », sortie « Digitone II »), écran
 * factice de Chromium. Vérifie : bandeau, aucun accès au chargement, MIDI au clic, voix
 * MPE, pads, horloge sortante, batterie calée sur une horloge externe, partage d'écran lu
 * par le shader de Concorde, refus d'un document non déclaré, aucune erreur JS / CSP.
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
  "jam-midi": fx("jam-midi.json"),
  ecran: fx("ecran.json"),
  "midi-non-declare": {
    schema: "artifacts/1", title: "MIDI non déclaré", defaultView: "v",
    views: [{id: "v", title: "v", root: {nodes: [{tagName: "sonic-midi", attributes: {id: "m"}}]}}],
  },
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

const FAKE_MIDI = `(() => {
  const input = { id: "in-1", name: "LinnStrument MIDI", manufacturer: "Roger Linn Design", state: "connected", onmidimessage: null };
  const sent = [];
  const output = { id: "out-1", name: "Digitone II", manufacturer: "Elektron", state: "connected", send(data, ts) { sent.push({ data: [...data], ts: ts ?? performance.now() }); } };
  let calls = 0;
  const access = { inputs: new Map([["in-1", input]]), outputs: new Map([["out-1", output]]), onstatechange: null };
  navigator.requestMIDIAccess = (o) => { calls++; window.__midiOpts = o; return Promise.resolve(access); };
  window.__midi = { calls: () => calls, sent, send(d, ts = performance.now()) { input.onmidimessage?.({ data: new Uint8Array(d), timeStamp: ts }); } };
})();`;

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--auto-select-desktop-capture-source=Entire screen", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"]});
const errors = [];
const open = async (slug) => {
  const page = await (await browser.newContext()).newPage();
  await page.addInitScript({content: FAKE_MIDI});
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused|Permissions policy|sonic-/i.test(m.text())) errors.push(m.text()); });
  await page.goto(`http://localhost:${PORT}/${slug}?k=tok`);
  await page.waitForTimeout(2500);
  return page;
};

/* Jam MIDI */
let page = await open("jam-midi");
const btn = (a) => page.locator(`sonic-button[data-action="${a}"]`).click({timeout: 3000});
const banner = await page.locator(".artifact-capabilities").textContent().catch(() => "");
check("bandeau : appareils MIDI", /appareils MIDI/.test(banner ?? ""), banner?.trim());
check("aucun accès MIDI au chargement", (await page.evaluate(() => __midi.calls())) === 0 && (await state(page, "midi"))?.status === "idle");
await btn("midi-start");
await page.waitForTimeout(600);
let midi = await state(page, "midi");
check("MIDI au clic, sans SysEx", midi?.status === "ready" && (await page.evaluate(() => window.__midiOpts?.sysex)) === false && midi.input[0] === "LinnStrument MIDI", JSON.stringify({status: midi?.status, input: midi?.input}));
await page.evaluate(() => { __midi.send([0xe2, 0x00, 0x50]); __midi.send([0x92, 64, 100]); __midi.send([0xd2, 90]); });
await page.waitForTimeout(300);
midi = await state(page, "midi");
const voix = await state(page, "voix");
check("note MPE (bend +12, pression) jouée par la voix", midi.held[0]?.name === "E4" && Math.abs(midi.held[0].bend - 12) < 0.01 && midi.held[0].pressure > 0.6 && voix.voices >= 1, JSON.stringify(midi.held));
check("store : dernière note", (await storeState(page, "jam"))?.last === "E4");
await page.evaluate(() => __midi.send([0x82, 64, 0]));
await btn("pad-3");
await page.waitForTimeout(200);
check("pad de secours joue la voix", (await state(page, "voix")).played >= 2 && (await storeState(page, "jam")).last === "G4");
await btn("clock"); await btn("play");
await page.waitForTimeout(1200);
const sent = await page.evaluate(() => __midi.sent.map((m) => m.data[0]));
check("horloge sortante : Start + ticks", sent.includes(0xfa) && sent.filter((b) => b === 0xf8).length > 40, `${sent.filter((b) => b === 0xf8).length} ticks`);
await btn("play"); await btn("clock");
await page.waitForTimeout(300);
await page.evaluate(async () => {
  const tick = 60000 / 124 / 24; let n = 0; const t0 = performance.now();
  window.__ext = setInterval(() => { const now = performance.now(); while (t0 + n * tick <= now) { __midi.send([0xf8], t0 + n * tick); n++; } }, 5);
  await new Promise((r) => setTimeout(r, 600));
  __midi.send([0xfa]);
});
await page.waitForTimeout(2500);
const beat = await state(page, "beat");
check("batterie calée sur l'horloge externe (124 bpm)", beat.playing && Math.abs(beat.bpm - 124) < 0.5 && beat.sync?.locked === true, JSON.stringify({bpm: beat.bpm, sync: beat.sync}));
await page.evaluate(() => { __midi.send([0xfc]); clearInterval(window.__ext); });
await page.waitForTimeout(200);
check("Stop externe", (await state(page, "beat")).playing === false);

/* Écran */
page = await open("ecran");
check("bandeau : partage d'écran", /partage d’écran/.test((await page.locator(".artifact-capabilities").textContent().catch(() => "")) ?? ""));
check("pas de partage avant le clic", (await state(page, "screen"))?.status === "idle");
await page.locator("sonic-media-start").locator("button").click({timeout: 3000});
await page.waitForTimeout(1500);
const scr = await state(page, "screen");
const fed = await page.evaluate(() => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  const el = deep(document, "#screen")[0];
  return { seq: el.frameSeq, consumers: el.frames?.consumers?.size ?? 0 };
});
check("partage au clic, lu par le sonic-shader de Concorde", scr?.status === "ready" && scr.width > 0 && fed.seq > 5 && fed.consumers > 0, JSON.stringify({status: scr?.status, w: scr?.width, ...fed}));

/* Document non déclaré */
page = await open("midi-non-declare");
const refused = await page.evaluate(() => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  return deep(document, "artifact-viewer")[0]?.shadowRoot?.textContent ?? "";
});
check("sonic-midi non déclaré refusé, aucun accès", /Document refusé/.test(refused) && /"midi"/.test(refused) && (await page.evaluate(() => __midi.calls())) === 0, refused.replace(/\s+/g, " ").slice(0, 160));

check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
