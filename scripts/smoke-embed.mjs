/**
 * Smoke test de l'intégration par balise script (public/embed.js → dist/embed/).
 *
 * Lancer :
 *   yarn smoke:embed            (build viewer + embed avec l'API locale, puis ce script)
 *   CHROME_PATH=…/chrome node scripts/smoke-embed.mjs   (si dist/ est déjà construit)
 *
 * Deux origines, comme en vrai :
 *   - :4455 = artifacts (dist/ + fausse API publique, CORS ouvert comme en prod) ;
 *   - :4466 = site tiers qui a déjà son propre `sonic-button`, `sonic-jsonata` et
 *     `sonic-store` (simule un Concorde / une creative-stack sur la page hôte).
 * La page tiers intègre trois artefacts : deux fois « atelier-visuel » (même store) et
 * « premier-son ». Vérifie : module commun et addons chargés une seule fois, addons
 * inutiles jamais chargés, rendu des trois, DataProviders isolés, hash de l'hôte intact.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const FIXTURES = path.join(ROOT, "tests/fixtures");
const API_PORT = 4455;
const HOST_PORT = 4466;

const requests = [];
const types = {".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".html": "text/html"};

const artifacts = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  requests.push(u.pathname);
  const cors = {"Access-Control-Allow-Origin": "*"};
  if (q.method === "OPTIONS") {
    r.writeHead(204, {...cors, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type"});
    return r.end();
  }
  const m = /^\/api\/public\/artifacts\/([a-z0-9-]+)(\/collections\/.*)?$/.exec(u.pathname);
  if (m) {
    r.writeHead(200, {"Content-Type": "application/json", ...cors});
    if (m[2]) return r.end('{"member":[]}');
    const doc = JSON.parse(fs.readFileSync(path.join(FIXTURES, `${m[1]}.json`), "utf8"));
    return r.end(JSON.stringify({id: m[1], slug: m[1], title: doc.title, description: "", visibility: "public",
      document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
  }
  const f = path.join(DIST, u.pathname);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    r.writeHead(404, cors);
    return r.end();
  }
  r.writeHead(200, {"Content-Type": types[path.extname(f)] ?? "application/octet-stream", ...cors});
  r.end(fs.readFileSync(f));
}).listen(API_PORT);

const HOST_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Site tiers</title>
<style>body{font-family:serif;color:#c00} button{background:red}</style>
<script>
  // Composants déjà présents sur la page hôte : l'embed ne doit ni planter ni les utiliser.
  for (const t of ["sonic-button", "sonic-jsonata", "sonic-store"]) {
    customElements.define(t, class extends HTMLElement { connectedCallback() { this.dataset.host = "1"; } });
  }
</script></head><body>
<h1>Mon blog</h1>
<script src="http://localhost:${API_PORT}/embed.js" data-artifact="atelier-visuel" data-theme="dark" async></script>
<p>entre deux</p>
<script src="http://localhost:${API_PORT}/embed.js" data-artifact="atelier-visuel" data-view="mosaique" data-height="420px" async></script>
<div id="slot"></div>
<script src="http://localhost:${API_PORT}/embed.js" data-artifact="premier-son" data-target="#slot" async></script>
</body></html>`;

/* Page sans composant hôte : deux fois le même jeu, chacun avec son store. */
const TWIN_PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script src="http://localhost:${API_PORT}/embed.js" data-artifact="atelier-visuel"></script>
<script src="http://localhost:${API_PORT}/embed.js" data-artifact="atelier-visuel"></script>
</body></html>`;

const host = http.createServer((q, r) => {
  r.writeHead(200, {"Content-Type": "text/html"});
  r.end(q.url.startsWith("/jumeaux") ? TWIN_PAGE : HOST_PAGE);
}).listen(HOST_PORT);

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "✔" : "✘"} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`http://localhost:${HOST_PORT}/#hote`);
await page.waitForTimeout(4000);

const s = await page.evaluate(() => {
  const deep = (r, sel, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(sel)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, sel, a); }); return a; };
  const embeds = [...document.querySelectorAll("artifact-embed")];
  return {
    embeds: embeds.map((e) => {
      const viewer = e.shadowRoot?.querySelector("artifact-viewer");
      const sdui = viewer?.shadowRoot?.querySelector("afx-sdui");
      const text = viewer?.shadowRoot?.textContent ?? "";
      return {
        slug: e.getAttribute("slug"),
        parent: e.parentElement?.id || e.parentElement?.tagName,
        rendered: !!sdui && sdui.childElementCount > 0,
        error: /Impossible|refusé/.test(text) ? text.trim().slice(0, 160) : "",
        ns: viewer?.ns ?? null,
        view: viewer?.viewId ?? null,
        height: e.style.height,
        stores: deep(e.shadowRoot, "sonic-store").map((x) => x.getAttribute("dataProvider") || x.id),
      };
    }),
    hostButtons: deep(document, "sonic-button").filter((b) => b.dataset.host === "1" && b.closest("artifact-embed") === null && b.getRootNode() !== document).length,
    afxButtons: deep(document, "afx-button").length,
    hash: location.hash,
  };
});

const count = (re) => requests.filter((p) => re.test(p)).length;
check("embed.js servi pour chaque balise (cache navigateur)", count(/^\/embed\.js$/) >= 1);
check("module commun chargé une seule fois", count(/^\/embed\/artifact-embed\.js$/) === 1, String(count(/^\/embed\/artifact-embed\.js$/)));
check("addon shader chargé une fois (2 artefacts l'utilisent)", count(/addon-shader-/) === 1, String(count(/addon-shader-/)));
check("addon audio chargé une fois", count(/addon-audio-/) === 1, String(count(/addon-audio-/)));
check("addons inutiles jamais chargés (3d, physique, hugging-face)", count(/addon-(3d|physics|hugging-face-infer)-/) === 0);
check("trois artefacts", s.embeds.length === 3);
for (const e of s.embeds) check(`rendu ${e.slug} (${e.parent})`, e.rendered && !e.error, e.error);
check("premier-son monté dans #slot", s.embeds[2]?.parent === "slot");
check("composants préfixés afx- (pas ceux de l'hôte)", s.afxButtons > 0 && s.hostButtons === 0, `afx=${s.afxButtons} hôte=${s.hostButtons}`);
check("1er atelier : pas de préfixe", s.embeds[0]?.ns === "", JSON.stringify(s.embeds[0]?.ns));
check("2e atelier : DataProviders préfixés", typeof s.embeds[1]?.ns === "string" && s.embeds[1].ns.startsWith("atelier-visuel~"), JSON.stringify(s.embeds[1]?.ns));
check("vue de départ data-view", s.embeds[1]?.view === "mosaique", String(s.embeds[1]?.view));
check("hauteur data-height", s.embeds[1]?.height === "420px", s.embeds[1]?.height);

// Navigation entre vues dans le 1er embed : le hash de la page hôte ne bouge pas.
await page.evaluate(() => {
  const viewer = document.querySelector("artifact-embed").shadowRoot.querySelector("artifact-viewer");
  const btn = [...viewer.shadowRoot.querySelectorAll("nav afx-button")].find((b) => b.getAttribute("variant") === "outline");
  btn?.click();
});
await page.waitForTimeout(800);
const after = await page.evaluate(() => ({
  hash: location.hash,
  view: document.querySelector("artifact-embed").shadowRoot.querySelector("artifact-viewer").viewId,
}));
check("changement de vue interne", after.view === "mosaique", String(after.view));
check("hash de la page hôte intact", after.hash === "#hote", after.hash);
const real = errors.filter((e) => !/AudioContext|autoplay|user gesture/i.test(e));
check("aucune erreur JS", real.length === 0, real.join(" | ").slice(0, 400));

// Deux instances du même artefact : un clic dans l'une ne change pas le store de l'autre.
console.log("\n== deux fois le même artefact");
const twin = await browser.newPage();
const twinErrors = [];
twin.on("pageerror", (e) => twinErrors.push(String(e)));
await twin.goto(`http://localhost:${HOST_PORT}/jumeaux`);
await twin.waitForTimeout(4000);
const states = () => twin.evaluate(() => {
  const deep = (r, sel, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(sel)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, sel, a); }); return a; };
  return [...document.querySelectorAll("artifact-embed")].map((e) => deep(e.shadowRoot, "sonic-store")[0]?.state ?? null);
});
const before = await states();
check("deux stores initialisés", before.length === 2 && before.every((x) => x?.sym === 6), JSON.stringify(before).slice(0, 120));
await twin.locator("artifact-embed").first().locator("sonic-action").nth(1).locator("afx-button").click({timeout: 3000});
await twin.waitForTimeout(600);
const afterClick = await states();
check("clic dans le 1er → sym 7", afterClick[0]?.sym === 7, `sym=${afterClick[0]?.sym}`);
check("2e artefact inchangé → sym 6", afterClick[1]?.sym === 6, `sym=${afterClick[1]?.sym}`);
await twin.locator("artifact-embed").nth(1).locator("sonic-action").nth(0).locator("afx-button").click({timeout: 3000});
await twin.waitForTimeout(600);
const afterSecond = await states();
check("clic dans le 2e (store préfixé) → sym 5", afterSecond[1]?.sym === 5, `sym=${afterSecond[1]?.sym}`);
check("1er artefact inchangé → sym 7", afterSecond[0]?.sym === 7, `sym=${afterSecond[0]?.sym}`);
check("aucune erreur JS (jumeaux)", twinErrors.length === 0, twinErrors.join(" | ").slice(0, 300));

await browser.close();
artifacts.close();
host.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
