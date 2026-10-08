/**
 * Smoke test des composants de formulaire A2UI (agent-stack) dans le viewer.
 *
 * Prérequis :
 *   VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer :
 *   node scripts/smoke-a2ui-form.mjs
 *
 * Sert dist/ avec la CSP de prod + une fausse API (tests/fixtures/a2ui-formulaire.json),
 * puis clique comme un utilisateur : onglets, radio, cases, curseur, modale, envoi
 * → l'action porte des valeurs au bon format (liste, booléen, nombre).
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const FIXTURE = path.join(ROOT, "tests/fixtures/a2ui-formulaire.json");
const PORT = 4455;
const doc = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; media-src 'self' https: blob: data:; connect-src 'self' https: blob:; worker-src 'self' blob: https://cdn.jsdelivr.net; child-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  if (u.pathname.startsWith("/api/public/artifacts/")) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    return r.end(JSON.stringify({id: "x", slug: "a2ui-formulaire", title: doc.title, description: "", visibility: "link",
      document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
  }
  let f = path.join(DIST, u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  const t = f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".svg") ? "image/svg+xml" : "text/html";
  r.writeHead(200, {"Content-Type": t, "Content-Security-Policy": CSP});
  r.end(fs.readFileSync(f));
}).listen(PORT);


const deepJs = `const all = (r, sel, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(sel)) a.push(e); if (e.shadowRoot) all(e.shadowRoot, sel, a); }); return a; };`;
const ev = (fn, arg) => page.evaluate(new Function("arg", deepJs + fn), arg);
let failures = 0;
const check = (label, ok, detail = "") => { console.log(`${ok ? "✔" : "✘"} ${label}${detail ? "  — " + detail : ""}`); if (!ok) failures++; };

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH});
const page = await (await browser.newContext({viewport: {width: 820, height: 720}})).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused/.test(m.text())) errors.push(m.text()); });
await page.goto(`http://localhost:${PORT}/a2ui-formulaire?k=tok`);
await page.waitForTimeout(2500);

/** Clique au centre d'un élément (même dans un shadow root), comme un vrai pointeur. */
const clickAt = async (sel, nth = 0) => {
  const box = await ev(`const e = all(document, arg.sel)[arg.nth]; if (!e) return null; e.scrollIntoView({block: "center"}); const r = e.getBoundingClientRect(); return {x: r.x + Math.min(12, r.width / 2), y: r.y + r.height / 2};`, {sel, nth});
  if (box) await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(250);
  return !!box;
};
const visible = (sel) => ev(`const e = all(document, arg)[0]; return !!e && e.getClientRects().length > 0;`, sel);

check("onglet 1 visible, onglet 2 masqué", (await visible('[data-sdui-node-id="niveau"]')) && !(await visible('[data-sdui-node-id="infos"]')));
await clickAt('[data-sdui-node-id="niveau"] sonic-radio', 1);
await clickAt('[data-sdui-node-id="options"] sonic-checkbox', 0);
await clickAt('[data-sdui-node-id="options"] sonic-checkbox', 1);
await clickAt('[data-sdui-node-id="cgu"] sonic-checkbox');
await ev(`const i = all(document, '[data-sdui-node-id="places"] sonic-input')[0].shadowRoot.querySelector("input"); i.value = "5"; i.dispatchEvent(new Event("input", {bubbles: true, composed: true})); i.dispatchEvent(new Event("change", {bubbles: true, composed: true}));`);
await page.waitForTimeout(250);
await clickAt('[data-sdui-node-id="help-btn"]');
check("modale ouverte par son déclencheur", await ev(`const m = all(document, '[data-sdui-node-id="help"]')[0]; return !!m?.shadowRoot?.querySelector("dialog")?.open;`));
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await clickAt('[data-sdui-node-id="send"]');
await page.waitForTimeout(400);
const st = await ev(`const s = all(document, "sonic-store")[0]; return s?.state ? JSON.parse(JSON.stringify(s.state)) : null;`);
const last = st?.last ?? {};
check("action envoyée au store", st?.sent === 1, JSON.stringify(st));
check("ChoicePicker exclusif → liste d'une valeur", JSON.stringify(last.niveau) === '["conf"]', JSON.stringify(last.niveau));
check("ChoicePicker multiple → liste", JSON.stringify([...(last.options ?? [])].sort()) === '["navette","repas"]', JSON.stringify(last.options));
check("CheckBox → booléen", last.cgu === true, JSON.stringify(last.cgu));
check("Slider → nombre", last.places === 5, JSON.stringify(last.places));
const sent = await ev(`return all(document, '[data-sdui-node-id="sent"]')[0]?.textContent;`);
check("compteur relu depuis le store", sent === "1", sent);
await clickAt('[data-sdui-node-id="root"]');
await ev(`all(document, '[data-sdui-node-id="root"]')[0].shadowRoot.querySelectorAll("button")[1].click();`);
await page.waitForTimeout(200);
check("onglet 2 affiché après clic", (await visible('[data-sdui-node-id="infos"]')) && !(await visible('[data-sdui-node-id="niveau"]')));
await ev(`all(document, '[data-sdui-node-id="root"]')[0].shadowRoot.querySelectorAll("button")[0].click();`);
await page.waitForTimeout(200);
if (process.env.SHOT) await page.screenshot({path: process.env.SHOT});
check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
