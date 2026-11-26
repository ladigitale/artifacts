/**
 * Smoke test des composants voix, VR / AR, export vidéo, graphes et capacités (creative-stack) dans le viewer.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-nouveautes.mjs
 *
 * Sert dist/ avec la CSP de prod + une fausse API publique (tests/fixtures/demo-*.json, les démos publiées).
 * Vérifie :
 * - sonic-graph : un tap sur un lieu calcule et affiche le plus court chemin ($graphPath) ;
 * - sonic-video-export : un vrai fichier WebM (en-tête EBML) de 120 images est produit par WebCodecs ;
 * - sonic-capabilities : hid, usb, nfc, xr, voix présents ;
 * - sonic-xr : avec un faux navigator.xr qui accepte la VR, le bouton « Entrer en VR » apparaît ;
 * - sonic-speak : avec une fausse synthèse vocale, le clic sur « Lire » parle et publie le texte prononcé ;
 * - aucune erreur JS / CSP.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const DOCS = Object.fromEntries(["graphe", "export-video", "appareil", "xr", "voix"].map((n) => [`demo-${n}`, JSON.parse(fs.readFileSync(path.join(ROOT, `tests/fixtures/demo-${n}.json`), "utf8"))]));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; media-src 'self' blob: data:; connect-src 'self' http://localhost:4455 https: blob:; object-src 'none'; base-uri 'self'";

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  const m = /^\/api\/public\/artifacts\/([^/]+)/.exec(u.pathname);
  if (m) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    const doc = DOCS[m[1]];
    return r.end(JSON.stringify({id: m[1], slug: m[1], title: doc.title, description: "", visibility: "link", document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
  }
  let f = path.join(DIST, u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  const t = f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".svg") ? "image/svg+xml" : "text/html";
  r.writeHead(200, {"Content-Type": t, "Content-Security-Policy": CSP, "Permissions-Policy": "hid=(self), usb=(self), xr-spatial-tracking=(self), microphone=(self)"});
  r.end(fs.readFileSync(f));
}).listen(PORT);

let failures = 0;
const check = (label, ok, detail = "") => { console.log(`${ok ? "✔" : "✘"} ${label}${detail ? "  — " + detail : ""}`); if (!ok) failures++; };
const DEEP = `const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };`;
const text = (p) => p.evaluate(`(() => { ${DEEP} const t = []; const walk = (r) => r.querySelectorAll("*").forEach((e) => { if (e.shadowRoot) walk(e.shadowRoot); }); walk(document); return document.body.innerText + " " + deep(document, "sonic-value").map((e) => e.shadowRoot ? e.shadowRoot.textContent : e.textContent).join(" "); })()`);

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"]});
const errors = [];
async function open(slug, init) {
  const ctx = await browser.newContext({viewport: {width: 900, height: 1000}});
  const page = await ctx.newPage();
  if (init) await page.addInitScript(init);
  page.on("pageerror", (e) => errors.push(`${slug}: ${e}`));
  page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused|sonic-/i.test(m.text())) errors.push(`${slug}: ${m.text()}`); });
  await page.goto(`http://localhost:${PORT}/${slug}?k=tok`);
  await page.waitForTimeout(2500);
  return page;
}

// 1. Graphe : tap sur « Phare » → plus court chemin depuis la gare (13 min, 5 étapes).
{
  const page = await open("demo-graphe");
  const pt = await page.evaluate(`(() => { ${DEEP} const g = deep(document, "sonic-graph")[0]; const c = [...g.shadowRoot.querySelectorAll("circle.node")].find((c) => c.querySelector("title")?.textContent === "Phare"); if (!c) return null; const r = c.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; })()`);
  check("graphe : nœuds dessinés", !!pt);
  if (pt) await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(800);
  const t = await text(page);
  check("graphe : tap → chemin calculé (Phare, 13 min, 5 étapes)", /Phare/.test(t) && /\b13\b/.test(t) && /\b5\b/.test(t), t.replace(/\s+/g, " ").slice(-120));
  const sel = await page.evaluate(`(() => { ${DEEP} return deep(document, "sonic-graph")[0].shadowRoot.querySelectorAll("circle.node.sel").length; })()`);
  check("graphe : chemin surligné (6 nœuds)", sel === 6, String(sel));
  await page.context().close();
}

// 2. Export vidéo : vrai WebM produit par WebCodecs.
{
  const page = await open("demo-export-video");
  await page.evaluate(`(() => { ${DEEP} deep(document, "#filmer")[0].click(); })()`);
  let info = null;
  for (let i = 0; i < 40 && !info; i++) {
    await page.waitForTimeout(500);
    info = await page.evaluate(`(async () => { ${DEEP} const v = deep(document, "sonic-video-export")[0]; const s = v.getState?.(); if (!s?.file?.url) return null; const b = new Uint8Array(await (await fetch(s.file.url)).arrayBuffer()); return {frames: s.frames, size: b.length, head: [...b.slice(0, 4)].map((x) => x.toString(16)).join(" "), codec: s.codec}; })()`);
  }
  check("export vidéo : fichier produit", !!info, JSON.stringify(info));
  check("export vidéo : 120 images à 30 i/s pour 4 s", info?.frames === 120, String(info?.frames));
  check("export vidéo : en-tête EBML (WebM)", info?.head === "1a 45 df a3", String(info?.head));
  await page.context().close();
}

// 3. Capacités : nouvelles clés publiées.
{
  const page = await open("demo-appareil");
  const caps = await page.evaluate(`(() => { ${DEEP} return deep(document, "sonic-capabilities")[0]?.getState?.() ?? null; })()`);
  const keys = ["hid", "usb", "nfc", "xr", "speechSynthesis", "speechRecognition"];
  check("capacités : hid, usb, nfc, xr, voix publiés", !!caps && keys.every((k) => typeof caps[k]?.supported === "boolean"), JSON.stringify(caps && Object.fromEntries(keys.map((k) => [k, caps[k]?.supported]))));
  await page.context().close();
}

// 4. VR : faux navigator.xr qui accepte immersive-vr → le bouton apparaît.
{
  const page = await open("demo-xr", () => {
    Object.defineProperty(navigator, "xr", {configurable: true, value: {isSessionSupported: async (m) => m === "immersive-vr", requestSession: async () => { throw Object.assign(new Error("faux"), {name: "NotSupportedError"}); }, addEventListener() {}, removeEventListener() {}}});
  });
  const visible = await page.evaluate(`(() => { ${DEEP} const b = deep(document, "#entrer")[0]; return !!b && b.getBoundingClientRect().width > 0; })()`);
  check("VR : bouton « Entrer en VR » affiché quand le casque est disponible", visible);
  const ar = await page.evaluate(`(() => { ${DEEP} const b = deep(document, "#poser")[0]; return !!b && b.getBoundingClientRect().width > 0; })()`);
  check("VR : bouton AR masqué sans AR", !ar);
  await page.context().close();
}

// 5. Voix : fausse synthèse vocale.
{
  const page = await open("demo-voix", () => {
    const spoken = (window.__spoken = []);
    class U { constructor(t) { this.text = t; this.lang = ""; this.rate = 1; this.pitch = 1; this.volume = 1; this.voice = null; } }
    window.SpeechSynthesisUtterance = U;
    const synth = {speaking: false, paused: false, pending: false, getVoices: () => [{name: "Voix test", lang: "fr-FR", localService: true, default: true, voiceURI: "t"}], addEventListener() {}, removeEventListener() {}, cancel() {}, pause() {}, resume() {},
      speak(u) { spoken.push(u.text); setTimeout(() => { u.onstart?.({}); u.onboundary?.({name: "word", charIndex: 0, charLength: 7}); setTimeout(() => u.onend?.({}), 50); }, 10); }};
    Object.defineProperty(window, "speechSynthesis", {configurable: true, value: synth});
  });
  await page.evaluate(`(() => { ${DEEP} deep(document, "#lire")[0].click(); })()`);
  await page.waitForTimeout(600);
  const spoken = await page.evaluate(() => window.__spoken);
  check("voix : le clic sur « Lire » parle le texte du champ", spoken.length > 0 && /Bonjour/.test(spoken.join(" ")), JSON.stringify(spoken).slice(0, 80));
  const st = await page.evaluate(`(() => { ${DEEP} return deep(document, "sonic-speak")[0]?.getState?.() ?? null; })()`);
  check("voix : texte prononcé publié dans l’état (spoken)", /Bonjour/.test(st?.spoken ?? ""), JSON.stringify(st && {word: st.word, spoken: st.spoken, speaking: st.speaking}));
  await page.context().close();
}

check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 400));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
