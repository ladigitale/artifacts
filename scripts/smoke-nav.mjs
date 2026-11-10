/**
 * Smoke test des onglets de vues du viewer.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : CHROME_PATH=…/chrome node scripts/smoke-nav.mjs
 *
 * Vérifie : barre en `sonic-menu` de `sonic-menu-item radio` branchés sur le DataProvider `artifactView`, onglet actif
 * rendu par Concorde (au chargement, au clic, après un changement de hash), `page.nav: "none"` masque la barre et un
 * document peut dessiner ses propres onglets sur `artifactView`.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const docs = {
  nav: JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/nav.json"), "utf8")),
  "nav-doc": JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/nav-doc.json"), "utf8")),
};

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  const m = /^\/api\/public\/artifacts\/([^/]+)/.exec(u.pathname);
  if (m) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    const doc = docs[m[1]];
    return r.end(JSON.stringify({id: m[1], slug: m[1], title: doc.title, description: "", visibility: "link", document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
  }
  let f = path.join(DIST, u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  const t = f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".svg") ? "image/svg+xml" : "text/html";
  r.writeHead(200, {"Content-Type": t});
  r.end(fs.readFileSync(f));
}).listen(PORT);

let failures = 0;
const check = (label, ok, detail = "") => { console.log(`${ok ? "✔" : "✘"} ${label}${detail ? "  — " + detail : ""}`); if (!ok) failures++; };
const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"]});
const errors = [];
const q = (p, sel) => p.evaluate((sel) => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  return deep(document, sel).map((e) => ({id: e.id, value: e.getAttribute("value"), active: e.hasAttribute("active")}));
}, sel);
const click = (p, sel) => p.evaluate((sel) => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  const el = deep(document, sel)[0];
  (el.shadowRoot?.querySelector("button") ?? el).click();
}, sel);
const has = async (p, id) => (await q(p, `#${id}`)).length > 0;
const active = async (p) => (await q(p, ".artifact-nav sonic-menu-item")).filter((x) => x.active).map((x) => x.value);

const ctx = await browser.newContext({viewport: {width: 900, height: 600}});
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/nav?k=tok`);
await page.waitForTimeout(1500);

const items = await q(page, ".artifact-nav sonic-menu sonic-menu-item");
check("barre en sonic-menu de 3 sonic-menu-item", items.length === 3, JSON.stringify(items));
check("aucun sonic-button d'onglet hérité", (await q(page, ".artifact-nav sonic-button")).length === 0);
check("au chargement : vue a, onglet a actif", (await has(page, "titre-a")) && JSON.stringify(await active(page)) === '["a"]', JSON.stringify(await active(page)));

await click(page, ".artifact-nav sonic-menu-item[value='b']");
await page.waitForTimeout(600);
check("clic sur Bravo : vue b", (await has(page, "titre-b")) && !(await has(page, "titre-a")));
check("clic sur Bravo : onglet b seul actif", JSON.stringify(await active(page)) === '["b"]', JSON.stringify(await active(page)));
check("l'URL porte la vue", (await page.evaluate(() => location.hash)) === "#b");

await page.evaluate(() => { location.hash = "#a"; });
await page.waitForTimeout(800);
check("changement de hash (lien interne) : vue et onglet suivent", (await has(page, "titre-a")) && JSON.stringify(await active(page)) === '["a"]', JSON.stringify(await active(page)));

await page.goto(`http://localhost:${PORT}/nav#c`);
await page.waitForTimeout(1500);
check("ouverture sur #c : onglet c actif", (await has(page, "titre-c")) && JSON.stringify(await active(page)) === '["c"]', JSON.stringify(await active(page)));
await page.screenshot({path: "/tmp/smoke-nav.png"});

const p2 = await ctx.newPage();
p2.on("pageerror", (e) => errors.push(String(e)));
await p2.goto(`http://localhost:${PORT}/nav-doc?k=tok`);
await p2.waitForTimeout(1500);
check("page.nav none : pas de barre du viewer", (await q(p2, ".artifact-nav")).length === 0);
check("onglets du document : a actif", (await q(p2, "#doc-a"))[0]?.active === true);
await click(p2, "#doc-b");
await p2.waitForTimeout(600);
check("onglet du document : bascule vers b", (await has(p2, "titre-b")) && (await p2.evaluate(() => location.hash)) === "#b");

check("aucune erreur JS", errors.length === 0, errors.join(" | ").slice(0, 400));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
