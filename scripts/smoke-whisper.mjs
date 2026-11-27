/**
 * Essai réel de la dictée Whisper (sonic-listen engine="whisper") dans le viewer : CSP de prod, micro simulé
 * qui joue un fichier WAV, vrai modèle téléchargé sur le Hub (réseau requis : huggingface.co, us.aws.cdn.hf.co,
 * cdn.jsdelivr.net). Trois visites : téléchargement puis modèle en cache.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : DOC=tests/fixtures/demo-dictee-locale.json WAV=parole.wav CHROME_PATH=… node scripts/smoke-whisper.mjs
 *            (WAV : par exemple https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = "/home/user/artifacts";
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const doc = JSON.parse(fs.readFileSync(process.env.DOC, "utf8"));
const CSP = "default-src 'self'; manifest-src 'self' https:; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; media-src 'self' https: blob: data:; connect-src 'self' http://localhost:4455 https: blob:; worker-src 'self' blob: https://cdn.jsdelivr.net; child-src 'self' blob:; base-uri 'self'";

const server = http
  .createServer((q, r) => {
    const u = new URL(q.url, "http://x");
    if (/^\/api\/public\/artifacts\//.test(u.pathname)) {
      r.writeHead(200, {"Content-Type": "application/json"});
      if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
      return r.end(JSON.stringify({id: "x", slug: "dictee", title: doc.title, description: "", visibility: "link", document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
    }
    let f = path.join(DIST, u.pathname);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
    r.writeHead(200, {"Content-Type": f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "text/html", "Content-Security-Policy": CSP, "Permissions-Policy": "microphone=(self)"});
    r.end(fs.readFileSync(f));
  })
  .listen(PORT);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${process.env.WAV}`, "--autoplay-policy=no-user-gesture-required"],
});
const ctx = await browser.newContext({viewport: {width: 900, height: 900}, permissions: ["microphone"]});
let page = await ctx.newPage();
const logs = [];
page.on("console", (m) => logs.push(m.type() + ": " + m.text()));
page.on("pageerror", (e) => logs.push("pageerror: " + e));
page.on("requestfailed", (r) => logs.push("requestfailed: " + r.url().slice(0, 120) + " " + r.failure()?.errorText));
await page.goto(`http://localhost:${PORT}/dictee?k=t`);
await page.waitForTimeout(4000);
const DEEP = `const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };`;
const st = () =>
  page.evaluate(`(() => { ${DEEP} const s = deep(document, "sonic-listen")[0].getState(); return {status: s.status, error: s.error, engine: s.engine, listening: s.listening, modelPhase: s.modelPhase, loading: s.loading, modelReady: s.modelReady, transcribing: s.transcribing, interim: s.interim, final: s.final, transcript: s.transcript}; })()`);
console.log("départ", JSON.stringify(await st()));
await page.evaluate(`(() => { ${DEEP} deep(document, "#dicter")[0].click(); })()`);
for (let i = 0; i < 90; i++) {
  await page.waitForTimeout(1000);
  const s = await st();
  if (i % 5 === 0 || s.modelPhase === "awaiting-consent") console.log(i, JSON.stringify(s));
  if (s.modelPhase === "awaiting-consent") {
    await page.evaluate(`(() => { ${DEEP} const b = deep(document, "sonic-button[name=accepted]")[0]; b?.shadowRoot?.querySelector("button")?.click() ?? b?.click(); })()`);
  }
  if (s.transcript || s.error) {
    console.log("fin", JSON.stringify(s));
    break;
  }
}
// Deuxième visite : modèle en cache, page rechargée
for (const round of [2, 3]) {
  await page.reload();
  await page.waitForTimeout(4000);
  console.log("visite", round, JSON.stringify(await st()));
  await page.evaluate(`(() => { ${DEEP} deep(document, "#dicter")[0].click(); })()`);
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1000);
    const s = await st();
    if (i % 5 === 0 || s.modelPhase === "awaiting-consent") console.log(round, i, JSON.stringify(s));
    if (s.modelPhase === "awaiting-consent") {
      await page.evaluate(`(() => { ${DEEP} const b = deep(document, "sonic-button[name=accepted]")[0]; b?.shadowRoot?.querySelector("button")?.click() ?? b?.click(); })()`);
    }
    if (s.transcript || s.error) { console.log("fin", round, JSON.stringify(s)); break; }
  }
}
console.log("--- journal");
console.log(logs.filter((l) => !/DevTools|Download the/.test(l)).slice(-40).join("\n"));
await browser.close();
server.close();
