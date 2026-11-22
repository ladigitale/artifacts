/**
 * Smoke test de `sonic-morse` (creative-stack, addon media) dans le viewer Artefacts.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : CHROME_PATH=…/chrome node scripts/smoke-morse.mjs
 *
 * Fixture `morse-torche` : chat entre deux téléphones (torche → caméra), deux passes avec une caméra
 * factice (vidéo générée ici) :
 * - passe « morse » : on choisit Morse dans les réglages ; la vidéo clignote « SOS » en morse (point de
 *   300 ms) puis se tait ; la sonde (detect="jump") voit les fronts, sonic-morse les décode, le message
 *   arrive dans le fil. Le même « SOS » sans signal de début est ignoré. Puis on envoie « é t » : le
 *   composant séquence la torche (absente de la caméra factice, ce que le store note).
 * - passe « rapide » (code par défaut) : la vidéo clignote deux messages du code rapide (une phrase de la
 *   table, « MDR », et du texte libre) puis le premier sans signal de début (ignoré). Puis on envoie une
 *   phrase par le menu « Phrases rapides » : durées émises, progression, fil.
 * Les durées du code rapide (INTERVALS) viennent de `fastPlan` de creative-stack avec la table de
 * l'artefact : à régénérer si le code ou la table changent (FAST_VERSION).
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

// Avec la liste d'équipe par défaut : « MDR » de Loup, « RDV 18H » d'Aigle (identifiant en tête), « OUI » de Renard.
const INTERVALS = {MDR: "1322111331221", "RDV 18H": "2112321122222111331323331113223133133"};

/** Écrit une vidéo Y4M 80×60 à 30 i/s, en boucle (une unité = 9 images = 300 ms), pour une suite d'unités 0 / 1. */
function writeVideo(name, units) {
  const W = 80, H = 60, UNIT = 9, file = path.join(os.tmpdir(), name);
  const parts = [Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\n`)];
  const chroma = Buffer.alloc((W / 2) * (H / 2) * 2, 128);
  for (const u of units) for (let i = 0; i < UNIT; i++) parts.push(Buffer.from("FRAME\n"), Buffer.alloc(W * H, u ? 235 : 16), chroma);
  fs.writeFileSync(file, Buffer.concat(parts));
  return file;
}

/**
 * Morse : signal de début (éclat de 5 unités, silence de 3), « SOS », 22 unités de noir ; puis, sans
 * signal de début, « SOS » encore (une lumière parasite, à ignorer) et 22 unités de noir.
 */
function morseVideo() {
  const letters = ["...", "---", "..."];
  const units = [];
  letters.forEach((l, i) => {
    [...l].forEach((s, j) => {
      units.push(...Array(s === "-" ? 3 : 1).fill(1));
      if (j < l.length - 1) units.push(0);
    });
    if (i < letters.length - 1) units.push(0, 0, 0);
  });
  const sos = [...units];
  units.unshift(1, 1, 1, 1, 1, 0, 0, 0);
  units.push(...Array(22).fill(0), ...sos, ...Array(22).fill(0));
  return writeVideo("smoke-morse-sos.y4m", units);
}

/** Code rapide : intervalles alternés allumé / éteint de 1 à 3 unités, le premier allumé. */
const fastUnits = (digits) => [...digits].flatMap((k, i) => Array(Number(k)).fill(i % 2 === 0 ? 1 : 0));

/** Rapide : « MDR » annoncé, noir, texte libre annoncé, noir, « MDR » sans signal de début (ignoré), noir. */
function fastVideo() {
  const start = [1, 1, 1, 1, 1, 1, 1, 0, 0, 0]; // début du code rapide : 5 + 2 unités
  const dark = Array(22).fill(0);
  const units = [...start, ...fastUnits(INTERVALS.MDR), ...dark, ...start, ...fastUnits(INTERVALS["RDV 18H"]), ...dark, ...fastUnits(INTERVALS.MDR), ...dark];
  return writeVideo("smoke-morse-fast.y4m", units);
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

const getChat = (page) => page.evaluate(() => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  return JSON.parse(JSON.stringify(deep(document, "sonic-store#chat")[0]?.state ?? null));
});
const progressBar = (page) => page.evaluate(() => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  const p = deep(document, "sonic-progress")[0];
  return p ? {value: Number(p.value), max: Number(p.max)} : null;
});

/** Ouvre une page de l'artefact avec la caméra factice `video`, caméra activée. */
async function open(video, tag) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${video}`, "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await (await browser.newContext({viewport: {width: 390, height: 844}})).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused|Permissions policy/i.test(m.text())) errors.push(m.text()); });
  await page.goto(`http://localhost:${PORT}/morse-torche?k=tok`);
  await page.waitForTimeout(2500);
  check(`[${tag}] rien ne démarre avant le clic`, (await state(page, "cam"))?.status !== "ready");
  await page.getByText("Activer la caméra").first().click({timeout: 3000});
  await page.waitForTimeout(2000);
  check(`[${tag}] caméra ouverte par le bouton`, (await state(page, "cam"))?.status === "ready");
  return {browser, page, errors};
}

/* ---------------------------------- passe morse ---------------------------------- */
{
  const {browser, page, errors} = await open(morseVideo(), "morse");
  check("[morse] code rapide par défaut", (await state(page, "morse"))?.codec === "fast");
  await page.getByText("Réglages").first().click({timeout: 3000});
  await page.waitForTimeout(400);
  await page.screenshot({path: path.join(os.tmpdir(), "smoke-morse-reglages.png")});
  await page.getByText("Morse", {exact: true}).first().click({timeout: 3000});
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await page.mouse.click(200, 700);
  await page.waitForTimeout(300);
  check("[morse] choix du code dans les réglages", (await state(page, "morse"))?.codec === "morse");

  // La vidéo boucle toutes les 31,8 s : entre deux « SOS » annoncés passe toujours un « SOS » sans annonce.
  let m = null;
  let sawStart = false;
  for (let i = 0; i < 220; i++) {
    await page.waitForTimeout(500);
    m = await state(page, "morse");
    if (m?.status === "receiving" && m.rx.text === "") sawStart = true;
    if (m?.received >= 2) break;
  }
  check("[morse] réception annoncée dès le signal de début", sawStart);
  check("[morse] deux messages annoncés reçus", m?.received === 2, `${m?.received} reçu(s), ${m?.dropped} écarté(s)`);
  const s = await state(page, "sonde");
  check("[morse] sonde en détection par sauts", s?.settings?.detect === "jump" && s.status === "ready", `fps ${s?.fps}, horloge ${s?.clock}, ${s?.edges} fronts`);
  check("[morse] message reçu et décodé", m?.lastReceived === "SOS", `reçu « ${m?.lastReceived} », ${m?.received} message(s), unité ${m?.rx?.unit}`);
  check("[morse] message dans le fil", /SOS/.test(await text(page)));
  await page.screenshot({path: path.join(os.tmpdir(), "smoke-morse-rx.png")});

  await page.locator('sonic-input input[name="draft"]').fill("é t");
  await page.locator("sonic-button", {hasText: "Envoyer"}).click({timeout: 3000});
  await page.waitForTimeout(600);
  m = await state(page, "morse");
  check("[morse] émission lancée par le bouton", m?.status === "sending" && m.tx.text === "E T", `${m?.status} « ${m?.tx?.text} » ${m?.tx?.signs}`);
  await page.waitForTimeout(3000); // signal de début (8 unités = 2,4 s) puis E : la première lettre est passée
  m = await state(page, "morse");
  const bar = await progressBar(page);
  check("[morse] progression de l'envoi : texte émis, texte restant, barre", m?.tx?.done === "E " && m.tx.rest === "T" && bar?.value === m.tx.timePercent && bar.value > 0, `« ${m?.tx?.done} » | « ${m?.tx?.rest} », ${m?.tx?.timePercent} %, barre ${JSON.stringify(bar)}`);
  check("[morse] pas de réception pendant l'émission", m?.rx?.text === "" && m.status === "sending");
  check("[morse] le fil montre le message envoyé, le champ est vidé", /é t/.test(await text(page)) && (await page.locator('sonic-input input[name="draft"]').inputValue()) === "");
  const chat = await getChat(page);
  check("[morse] torche absente de la caméra factice signalée", /Pas de torche/.test(chat?.notice ?? ""), chat?.notice);
  check("[morse] l'état du chat reste propre (pas de métadonnées de liste)", (chat?.messages ?? []).every((x) => Object.keys(x).join() === "id,who,text"), JSON.stringify(chat?.messages));
  check("[morse] le fil ne contient que les deux « SOS » annoncés et le message envoyé (le « SOS » sans annonce est ignoré)", (chat?.messages ?? []).map((x) => x.text).join("|") === "SOS|SOS|é t");
  await page.screenshot({path: path.join(os.tmpdir(), "smoke-morse-tx.png")});
  await page.waitForTimeout(3500); // reste : mot (7) + T (3) + 3
  m = await state(page, "morse");
  check("[morse] émission terminée", m?.status !== "sending" && m.sent === 1 && m.lastSent === "E T" && m.on === false, `${m?.status}, ${m?.sent} envoyé(s)`);
  check("[morse] aucune erreur JS / CSP / permissions", errors.length === 0, errors.join(" | ").slice(0, 300));
  await browser.close();
}

/* ---------------------------------- passe rapide --------------------------------- */
{
  const {browser, page, errors} = await open(fastVideo(), "rapide");
  let m = null;
  for (let i = 0; i < 160; i++) {
    await page.waitForTimeout(500);
    m = await state(page, "morse");
    if (m?.received >= 2) break;
  }
  check("[rapide] deux messages annoncés reçus", m?.received === 2, `${m?.received} reçu(s), ${m?.errors} rejeté(s), ${m?.dropped} écarté(s)`);
  let chat = await getChat(page);
  // La caméra factice entre dans la boucle à un point quelconque : l'ordre des deux messages varie.
  check("[rapide] phrase de la table et texte libre dans le fil", (chat?.messages ?? []).map((x) => x.text).sort().join("|") === "AIGLE : RDV 18H|LOUP : MDR", JSON.stringify((chat?.messages ?? []).map((x) => x.text)));
  await page.waitForTimeout(25000); // le « MDR » sans signal de début passe encore : ignoré
  m = await state(page, "morse");
  chat = await getChat(page);
  check("[rapide] le message sans signal de début est ignoré", (chat?.messages ?? []).every((x) => x.who === "autre" ? ["LOUP : MDR", "AIGLE : RDV 18H"].includes(x.text) : true) && m.errors === 0, `${m?.received} reçu(s), ${m?.errors} rejeté(s)`);
  await page.screenshot({path: path.join(os.tmpdir(), "smoke-morse-fast-rx.png")});

  await page.locator('[aria-label="Phrases rapides"]').first().click({timeout: 3000});
  await page.waitForTimeout(500);
  await page.screenshot({path: path.join(os.tmpdir(), "smoke-morse-phrases.png")});
  await page.getByText("OUI", {exact: true}).first().click({timeout: 3000});
  await page.waitForTimeout(800);
  m = await state(page, "morse");
  check("[rapide] phrase choisie dans le menu : émission", m?.status === "sending" && m.tx.text === "OUI" && m.codec === "fast", `${m?.status} « ${m?.tx?.text} » ${m?.tx?.signs}`);
  check("[rapide] durées émises du code rapide (une seule clé pour « OUI »)", m?.tx?.signs === "1221112133113", m?.tx?.signs);
  // La progression avance par symbole : la phrase entière compte quand sa clé est émise.
  let bar = null;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(400);
    m = await state(page, "morse");
    bar = await progressBar(page);
    if (m?.tx?.timePercent > 0) break;
  }
  check("[rapide] barre de progression dans le temps, secondes restantes", bar?.max === 100 && bar.value > 0 && bar.value === m?.tx?.timePercent && m.tx.remaining > 0 && m.tx.duration > 0, `${JSON.stringify(bar)}, ${m?.tx?.timePercent} %, reste ${m?.tx?.remaining} s`);
  check("[rapide] le fil montre la phrase envoyée", /OUI/.test(await text(page)));
  for (let i = 0; i < 40 && (await state(page, "morse"))?.status === "sending"; i++) await page.waitForTimeout(500);
  m = await state(page, "morse");
  check("[rapide] émission terminée", m?.status !== "sending" && m.sent === 1 && m.lastSent === "OUI" && m.on === false, `${m?.status}, ${m?.sent} envoyé(s)`);
  chat = await getChat(page);
  check("[rapide] torche absente signalée, état du chat propre", /Pas de torche/.test(chat?.notice ?? "") && (chat?.messages ?? []).every((x) => Object.keys(x).join() === "id,who,text"), chat?.notice);
  check("[rapide] aucune erreur JS / CSP / permissions", errors.length === 0, errors.join(" | ").slice(0, 300));
  await browser.close();
}

server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nOK");
process.exit(failures ? 1 : 0);
