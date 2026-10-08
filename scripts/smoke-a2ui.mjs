/**
 * Smoke test des vues A2UI (agent-stack) et des libraries `a2ui:*` / `chat:*`.
 *
 * Prérequis :
 *   VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer :
 *   node scripts/smoke-a2ui.mjs
 *
 * Sert dist/ avec la CSP de prod + une fausse API qui renvoie
 * tests/fixtures/a2ui-reservation.json, puis vérifie : surface A2UI rendue
 * (composants arrivés enfants d'abord, data model), champ lié, action → store
 * `booking`, vue SDUI avec le gabarit `chat:confirm`, aucune erreur JS / CSP.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const FIXTURE = path.join(ROOT, "tests/fixtures/a2ui-reservation.json");
const PORT = 4455;
const doc = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; media-src 'self' https: blob: data:; connect-src 'self' https: blob:; worker-src 'self' blob: https://cdn.jsdelivr.net; child-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  if (u.pathname.startsWith("/api/public/artifacts/")) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    return r.end(JSON.stringify({id: "x", slug: "a2ui-reservation", title: doc.title, description: "", visibility: "link",
      document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
  }
  let f = path.join(DIST, u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  const t = f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".svg") ? "image/svg+xml" : "text/html";
  r.writeHead(200, {"Content-Type": t, "Content-Security-Policy": CSP});
  r.end(fs.readFileSync(f));
}).listen(PORT);

const q = (p, sel) => p.evaluate((sel) => {
  const all = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(sel)) a.push(e); if (e.shadowRoot) all(e.shadowRoot, a); }); return a; };
  return all(document).map((e) => ({tag: e.tagName.toLowerCase(), text: (e.shadowRoot ? e.shadowRoot.textContent : e.textContent).trim(), placeholder: e.hasAttribute("data-sdui-placeholder")}));
}, sel);
const storeState = (p) => p.evaluate(() => {
  const all = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches("sonic-store")) a.push(e); if (e.shadowRoot) all(e.shadowRoot, a); }); return a; };
  const s = all(document)[0];
  return s?.state ? JSON.parse(JSON.stringify(s.state)) : null;
});
const clickDeep = (p, sel) => p.evaluate((sel) => {
  const all = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(sel)) a.push(e); if (e.shadowRoot) all(e.shadowRoot, a); }); return a; };
  all(document)[0]?.click();
}, sel);

let failures = 0;
const check = (label, ok, detail = "") => { console.log(`${ok ? "✔" : "✘"} ${label}${detail ? "  — " + detail : ""}`); if (!ok) failures++; };

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH});
const page = await (await browser.newContext()).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused/.test(m.text())) errors.push(m.text()); });
await page.goto(`http://localhost:${PORT}/a2ui-reservation?k=tok`);
await page.waitForTimeout(2500);

const title = await q(page, '[data-sdui-node-id="title"]');
check("titre lié au data model", title[0]?.tag === "h3" && title[0].text === "Orchestre d'harmonie", JSON.stringify(title));
const card = await q(page, '[data-sdui-node-id="root"]');
check("carte A2UI → sonic-card", card[0]?.tag === "sonic-card");
check("aucun placeholder restant", (await q(page, "[data-sdui-placeholder]")).length === 0);
for (const id of ["title", "when", "qty", "book", "row", "col"]) {
  const n = (await q(page, `[data-sdui-node-id="${id}"]`)).length;
  if (n !== 1) check(`nœud ${id} rendu une fois`, false, `${n}`);
}
const field = await q(page, '[data-sdui-node-id="qty"]');
check("champ lié → sonic-input", field[0]?.tag === "sonic-input");
const count0 = await q(page, '[data-sdui-node-id="count"]');
check("état initial du store visible", count0[0]?.text === "0", JSON.stringify(count0));

await clickDeep(page, '[data-sdui-node-id="book"]');
await page.waitForTimeout(500);
const st = await storeState(page);
const count = await q(page, '[data-sdui-node-id="count"]');
check("état du store recopié dans la surface (a2uiBindings)", count[0]?.text === "1", JSON.stringify(count));
check("action → store booking", st?.count === 1 && st?.last?.show === "Orchestre d'harmonie" && String(st?.last?.qty) === "2" && st?.last?.surfaceId === "booking", JSON.stringify(st));

await page.goto(`http://localhost:${PORT}/a2ui-reservation?k=tok#confirmer`);
await page.waitForTimeout(2000);
const main = await q(page, "sonic-card-main sonic-value");
check("chat:confirm : contenu dans sonic-card-main", main.length === 1, JSON.stringify(main));
const ok = await q(page, 'sonic-form-actions [data-test="ok"]');
check("chat:confirm : bouton routé dans sonic-form-actions", ok.length === 1 && ok[0].tag === "sonic-button");
const css = await page.evaluate(() => {
  const all = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.shadowRoot) { a.push(e.shadowRoot); all(e.shadowRoot, a); } }); return a; };
  return all(document).some((s) => s.getElementById?.("agent-stack-styles"));
});
check("CSS agent-stack injectée dans le shadow root", css);

check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
