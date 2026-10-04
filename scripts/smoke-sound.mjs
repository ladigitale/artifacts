/**
 * Smoke test du son (addon creative-stack `sound`) dans le viewer Artefacts.
 *
 * Prérequis :
 *   VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer :
 *   node scripts/smoke-sound.mjs
 *
 * Sert dist/ avec la CSP de prod + une fausse API publique qui renvoie
 * tests/fixtures/sound-lab.json (store JSONata + sonic-sound piloté par
 * `game.sound`), puis vérifie : déverrouillage au premier geste, musique
 * et position publiées, compteurs `play`, fondu vers un autre morceau,
 * pause, muet, sons d'interface `sonic-sfx`, aucune erreur JS / CSP.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const FIXTURE = path.join(ROOT, "tests/fixtures/sound-lab.json");
const PORT = 4455;
const doc = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; media-src 'self' https: blob: data:; connect-src 'self' https: blob:; worker-src 'self' blob: https://cdn.jsdelivr.net; child-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  if (u.pathname.startsWith("/api/public/artifacts/")) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    return r.end(JSON.stringify({id: "x", slug: "sound-lab", title: doc.title, description: "", visibility: "link",
      document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
  }
  let f = path.join(DIST, u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  const t = f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".svg") ? "image/svg+xml" : "text/html";
  r.writeHead(200, {"Content-Type": t, "Content-Security-Policy": CSP});
  r.end(fs.readFileSync(f));
}).listen(PORT);

/** État du moteur son (via le composant) + état du store. */
const snapshot = (p) => p.evaluate(() => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  const sound = deep(document, "sonic-sound")[0];
  const store = deep(document, "sonic-store")[0];
  const values = deep(document, "sonic-value").map((v) => (v.shadowRoot ? v.shadowRoot.textContent : v.textContent).trim());
  return {
    sound: sound?.soundEngine ? JSON.parse(JSON.stringify(sound.soundEngine.getState())) : null,
    state: store?.state ? JSON.parse(JSON.stringify(store.state)) : null,
    values,
  };
});

let failures = 0;
const check = (label, ok, detail = "") => { console.log(`${ok ? "✔" : "✘"} ${label}${detail ? "  — " + detail : ""}`); if (!ok) failures++; };

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH});
const page = await (await browser.newContext()).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused/.test(m.text())) errors.push(m.text()); });
await page.goto(`http://localhost:${PORT}/sound-lab?k=tok`);
await page.waitForTimeout(2500);

const btn = (label) => page.locator(`sonic-button[data-action="${label}"]`).click({timeout: 3000});

let s = await snapshot(page);
check("sonic-sound monté, banque valide", s.sound && s.sound.errors.length === 0 && s.sound.songs.includes("theme"), JSON.stringify(s.sound?.errors));
check("pas de son avant geste", s.sound?.unlocked === false);
check("libellés remplis", s.values.filter(Boolean).length > 10, `${s.values.filter(Boolean).length}/${s.values.length}`);

await btn("theme");
await page.waitForTimeout(2200);
s = await snapshot(page);
check("déverrouillé au premier clic", s.sound?.unlocked === true);
check("musique publiée et position qui avance", s.sound?.music.id === "theme" && s.sound.music.playing && (s.sound.music.bar > 0 || s.sound.music.beat > 0), JSON.stringify(s.sound?.music));
check("état visible dans la page (sonic-value)", s.values.includes("theme"), s.values.join(" · "));

for (let i = 0; i < 3; i++) { await btn("coin"); await page.waitForTimeout(150); }
s = await snapshot(page);
check("compteurs play → 3 pièces jouées", s.sound?.played.coin === 3, JSON.stringify(s.sound?.played));
check("combo du store", s.state?.combo === 3 && s.state?.sound.play.coin.pitch === 2);
check("sons d'interface sonic-sfx", (s.sound?.played.click ?? 0) >= 4 && s.sound.lastUi?.id === "click");

await btn("boss");
await page.waitForTimeout(1200);
s = await snapshot(page);
check("fondu vers boss", s.sound?.music.id === "boss" && s.sound.music.bpm === 150);

await btn("pause");
await page.waitForTimeout(600);
const m1 = (await snapshot(page)).sound.music;
await page.waitForTimeout(700);
s = await snapshot(page);
check("pause : position figée", s.sound.paused && !s.sound.music.playing && m1.bar === s.sound.music.bar && m1.beat === s.sound.music.beat);
await btn("pause");

await btn("win");
await page.waitForTimeout(200);
s = await snapshot(page);
check("jingle par-dessus la musique", s.sound?.played.win === 1 && s.sound.music.id === "boss");

await btn("mute");
await page.waitForTimeout(200);
s = await snapshot(page);
check("muet", s.sound?.muted === true);

check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
