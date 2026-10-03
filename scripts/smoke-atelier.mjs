/**
 * Smoke test du viewer Artefacts sur la démo « Atelier visuel ».
 *
 * Prérequis :
 *   yarn add -D playwright
 *   VITE_API_BASE_URL=http://localhost:4455 yarn build   (dist/ vidé avant)
 * Lancer :
 *   node scripts/smoke-atelier.mjs
 *
 * Sert dist/ avec la CSP de prod + une fausse API publique qui renvoie
 * tests/fixtures/atelier-visuel.json, puis vérifie (mobile, Chromium) :
 * routes avec et sans "/" final, libellés, WebGL, store, bouton, swipe,
 * tap, clavier, ticker, pause. Code de sortie 1 au premier échec.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium, devices} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const FIXTURE = path.join(ROOT, "tests/fixtures/atelier-visuel.json");
const PORT = 4455;
const doc = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; media-src 'self' https: blob: data:; connect-src 'self' https: blob:; worker-src 'self' blob: https://cdn.jsdelivr.net; child-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  if (u.pathname.startsWith("/api/public/artifacts/")) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    return r.end(JSON.stringify({id: "x", slug: "atelier-visuel", title: doc.title, description: "", visibility: "link",
      document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
  }
  let f = path.join(DIST, u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html"); // = try_files Caddy
  const t = f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".svg") ? "image/svg+xml" : "text/html";
  r.writeHead(200, {"Content-Type": t, "Content-Security-Policy": CSP});
  r.end(fs.readFileSync(f));
}).listen(PORT);

const snapshot = (p) => p.evaluate(() => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  const store = deep(document, "sonic-store")[0];
  const values = deep(document, "sonic-value").map((v) => (v.shadowRoot ? v.shadowRoot.textContent : v.textContent).trim());
  const shader = deep(document, "sonic-shader")[0];
  const canvas = shader?.shadowRoot?.querySelector("canvas");
  return {
    viewer: deep(document, "artifact-viewer").length > 0,
    state: store?.state ?? null,
    stateIsPromise: !!store?.state && typeof store.state.then === "function",
    lastError: store?.lastError ?? null,
    labels: [values.filter(Boolean).length, values.length],
    webgl: !!canvas && canvas.width > 0,
  };
});

let failures = 0;
const check = (label, ok, detail = "") => { console.log(`${ok ? "✔" : "✘"} ${label}${detail ? "  — " + detail : ""}`); if (!ok) failures++; };

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]});
for (const url of ["/atelier-visuel/?k=tok", "/atelier-visuel?k=tok"]) {
  console.log(`\n== ${url}`);
  const page = await (await browser.newContext({...devices["Pixel 7"]})).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused/.test(m.text())) errors.push(m.text()); });
  await page.goto(`http://localhost:${PORT}${url}`);
  await page.waitForTimeout(3000);

  let s = await snapshot(page);
  check("viewer monté", s.viewer);
  check("libellés remplis", s.labels[0] === s.labels[1] && s.labels[1] > 0, `${s.labels[0]}/${s.labels[1]}`);
  check("canvas WebGL du shader", s.webgl);
  check("état initial du store", s.state?.sym === 6, JSON.stringify(s.state)?.slice(0, 60));

  await page.locator("sonic-action").nth(1).click({timeout: 3000});
  await page.waitForTimeout(400);
  s = await snapshot(page);
  check("bouton + branches → sym 7", s.state?.sym === 7 && !s.stateIsPromise, s.stateIsPromise ? "état = Promise (await manquant)" : `sym=${s.state?.sym}`);

  const g = await page.locator("sonic-gesture").first().boundingBox({timeout: 3000});
  await page.mouse.move(g.x + 40, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width - 40, g.y + g.height / 2, {steps: 6});
  await page.mouse.up();
  await page.waitForTimeout(500);
  s = await snapshot(page);
  check("swipe → sym 8 (pas d'appui long)", s.state?.sym === 8 && s.state?.twist === 1, `sym=${s.state?.sym} twist=${s.state?.twist}`);

  await page.mouse.click(g.x + g.width / 2, g.y + g.height / 2);
  await page.waitForTimeout(500);
  s = await snapshot(page);
  check("tap → couleur change", s.state?.hue === 0.717, `hue=${s.state?.hue}`);

  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(400);
  s = await snapshot(page);
  check("clavier ↑ → zoom 1.75", s.state?.zoom === 1.75, `zoom=${s.state?.zoom}`);

  await page.evaluate(() => { location.hash = "mosaique"; });
  await page.waitForTimeout(1200);
  const f0 = (await snapshot(page)).state?.frame;
  await page.waitForTimeout(1000);
  s = await snapshot(page);
  check("ticker anime la mosaïque", typeof f0 === "number" && s.state?.frame > f0, `frame ${f0} → ${s.state?.frame}`);

  await page.locator("sonic-action").nth(2).click({timeout: 3000});
  await page.waitForTimeout(500);
  s = await snapshot(page);
  check("pause", s.state?.running === false);
  check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 300));
  await page.close();
}
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
