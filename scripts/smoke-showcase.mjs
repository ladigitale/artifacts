/**
 * Smoke test de la vitrine de l'accueil et de sa page d'admin (`/admin/vitrine`).
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 VITE_TADAAA_URL=http://localhost:4455 yarn build
 * Lancer   : CHROME_PATH=…/chrome node scripts/smoke-showcase.mjs
 *
 * Vérifie : l'accueil montre la sélection publiée (collection `vitrine` de `accueil-vitrine`), carte à la une
 * en tête, retour à la sélection par défaut si la collection est injoignable ; la page d'admin est
 * réservée au super admin, filtre, ajoute, ordonne, règle une carte (modale), passe un artefact en public
 * après confirmation, choisit la carte à la une et publie la sélection.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const SHOTS = process.env.SHOTS_DIR || "";

const artifacts = [
  {id: "v0", slug: "accueil-vitrine", title: "Vitrine de l’accueil", visibility: "public"},
  {id: "a1", slug: "billard-3d", title: "Billard", visibility: "public", description: "Billard 3D"},
  {id: "a2", slug: "pumpkin-run", title: "Pumpkin Run", visibility: "public", description: "Runner"},
  {id: "a3", slug: "ma-chambre", title: "Ma chambre — plan 3D", visibility: "link", description: "Concevoir sa chambre en 3D."},
  {id: "a4", slug: "notes-privees", title: "Notes privées", visibility: "private", description: ""},
].map((a) => ({...a, url: `http://localhost:${PORT}/${a.slug}`, updatedAt: new Date().toISOString(), datasetId: "d", currentVersion: 1}));

let superAdmin = true;
let collectionDown = false;
let record = {id: "r1", data: {une: null, items: [{slug: "billard-3d", title: "Billard", kind: "Jeu 3D", blurb: "Quinze billes."}, {slug: "pumpkin-run", title: "Pumpkin Run", kind: "Jeu", blurb: "Une citrouille."}]}};
const writes = [];

const json = (r, body, status = 200) => { r.writeHead(status, {"Content-Type": "application/json"}); r.end(JSON.stringify(body)); };
const readBody = (q) => new Promise((ok) => { let b = ""; q.on("data", (c) => (b += c)); q.on("end", () => ok(b ? JSON.parse(b) : {})); });
const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#f80"/></svg>`;

const server = http.createServer(async (q, r) => {
  const u = new URL(q.url, "http://x");
  const p = u.pathname;
  if (p === "/api/auth/me") return json(r, {user: {email: "admin@example.org"}, superAdmin});
  if (p === "/api/public/artifacts/accueil-vitrine/collections/vitrine") {
    if (collectionDown) return json(r, {error: "down"}, 503);
    return json(r, {member: record ? [record] : []});
  }
  if (/^\/api\/public\/artifacts\/[^/]+\/icon\.svg$/.test(p)) { r.writeHead(200, {"Content-Type": "image/svg+xml"}); return r.end(ICON); }
  if (p === "/api/artifacts") return json(r, {member: artifacts});
  let m = p.match(/^\/api\/artifacts\/([^/]+)\/collections\/vitrine\/records(?:\/([^/]+))?$/);
  if (m) {
    if (q.method === "GET") return json(r, {member: record ? [record] : []});
    const body = await readBody(q);
    writes.push({method: q.method, data: body.data});
    if (q.method === "POST") { record = {id: "r2", data: body.data}; return json(r, record, 201); }
    if (q.method === "PATCH") { record = {id: m[2], data: body.data}; return json(r, record); }
  }
  m = p.match(/^\/api\/artifacts\/([^/]+)$/);
  if (m) {
    const a = artifacts.find((x) => x.id === m[1] || x.slug === m[1]);
    if (!a) return json(r, {error: "nope"}, 404);
    if (q.method === "PATCH") { Object.assign(a, await readBody(q)); }
    return json(r, a);
  }
  if (p === "/api/appearance") return json(r, {themeId: "affiche", vars: {}, shell: {}});
  if (p.startsWith("/api/")) return json(r, {member: []});
  let f = path.join(DIST, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  const t = f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".svg") ? "image/svg+xml" : "text/html";
  r.writeHead(200, {"Content-Type": t});
  r.end(fs.readFileSync(f));
}).listen(PORT);
if (process.env.SERVE_ONLY) await new Promise(() => {});

let failures = 0;
const check = (label, ok, detail = "") => { console.log(`${ok ? "✔" : "✘"} ${label}${detail ? "  — " + detail : ""}`); if (!ok) failures++; };
const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"]});
const errors = [];
const deepFn = `const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };`;
const all = (p, sel) => p.evaluate(new Function("sel", `${deepFn} return deep(document, sel).map((e) => ({text: e.textContent.trim().replace(/\\s+/g, " "), slug: e.getAttribute("data-featured") || e.getAttribute("data-slug"), une: e.hasAttribute("data-une"), checked: e.getAttribute("aria-checked"), disabled: e.hasAttribute("disabled")}));`), sel);
const click = (p, sel, i = 0) => p.evaluate(new Function("o", `const {sel, i} = o; ${deepFn} const el = deep(document, sel)[i]; if (!el) throw new Error("absent : " + sel); (el.shadowRoot?.querySelector("button") ?? el).click();`), {sel, i});
const typeIn = (p, sel, value) => p.evaluate(new Function("o", `const {sel, v} = o; ${deepFn} const host = deep(document, sel)[0]; if (!host) throw new Error("absent : " + sel); const el = host.shadowRoot?.querySelector("input, textarea") ?? host; el.value = v; el.dispatchEvent(new Event("input", {bubbles: true, composed: true})); el.dispatchEvent(new Event("change", {bubbles: true, composed: true}));`), {sel, v: value});
const shot = async (p, name) => { if (SHOTS) await p.screenshot({path: path.join(SHOTS, name), fullPage: false}); };
const origin = `http://localhost:${PORT}`;
const wait = (p, ms) => p.waitForTimeout(ms);

// ── Accueil : sélection publiée ──
const ctx = await browser.newContext({viewport: {width: 1100, height: 900}});
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`${origin}/`);
await wait(page, 1500);
let cards = await all(page, "a[data-featured]");
check("accueil : la sélection publiée remplace celle par défaut", cards.map((c) => c.slug).join(",") === "billard-3d,pumpkin-run", cards.map((c) => c.slug).join(","));
check("accueil : l'astérisque n° 4 reste trouvable avec moins de cinq cartes", (await all(page, ".showcase .star-spot")).length === 1);

record.data.une = "pumpkin-run";
await page.reload();
await wait(page, 1500);
cards = await all(page, "a[data-featured]");
check("accueil : la carte à la une passe en tête", cards[0]?.slug === "pumpkin-run" && cards[0].une && cards[0].text.includes("À la une"), JSON.stringify(cards[0]));
await page.evaluate(() => document.querySelector("artifact-landing")?.shadowRoot?.querySelector(".showcase")?.scrollIntoView());
await wait(page, 900);
await shot(page, "showcase-home.png");

collectionDown = true;
await page.reload();
await wait(page, 1500);
cards = await all(page, "a[data-featured]");
check("accueil : collection injoignable → sélection par défaut", cards.length === 11, String(cards.length));
collectionDown = false;

// ── Admin : réservé au super admin ──
const admin = await ctx.newPage();
admin.on("pageerror", (e) => errors.push(String(e)));
await admin.goto(`${origin}/`);
await admin.evaluate((o) => localStorage.setItem("artifacts-account", JSON.stringify({apiBaseUrl: o, token: "jwt", user: {email: "admin@example.org"}})), origin);
superAdmin = false;
await admin.goto(`${origin}/admin/vitrine`);
await wait(admin, 1500);
check("admin : refusé hors super admin", (await all(admin, "h2")).some((h) => h.text.includes("Réservé au super admin")));
superAdmin = true;
await admin.goto(`${origin}/admin/vitrine`);
await wait(admin, 1800);
const selected = () => all(admin, "section[aria-labelledby=sel-title] li.row");
const catalogue = () => all(admin, "section[aria-labelledby=all-title] li.row");
let sel = await selected();
check("admin : sélection relue (2 cartes, Pumpkin Run à la une)", sel.length === 2 && sel.find((s) => s.slug === "pumpkin-run")?.une === true, sel.map((s) => s.slug).join(","));
let cat = await catalogue();
check("admin : catalogue sans l'artefact vitrine lui-même", cat.length === 4 && !cat.some((c) => c.slug === "accueil-vitrine"), cat.map((c) => c.slug).join(","));
check("admin : rien à publier tant que rien n'a changé", (await all(admin, "sonic-button[data-save]"))[0]?.disabled === true);

// Filtre de recherche
await typeIn(admin, "sonic-input[name=q]", "chambre");
await wait(admin, 400);
cat = await catalogue();
check("admin : recherche filtre le catalogue", cat.length === 1 && cat[0].slug === "ma-chambre", cat.map((c) => c.slug).join(","));
await shot(admin, "showcase-admin.png");

// Artefact « par lien » : confirmation, passage en public, ajout
await click(admin, "section[aria-labelledby=all-title] li.row sonic-button");
await wait(admin, 500);
check("admin : un artefact par lien demande confirmation", (await all(admin, "sonic-modal-title")).some((t) => t.text.includes("Rendre public")));
await shot(admin, "showcase-admin-public.png");
await click(admin, "sonic-modal-actions sonic-button[type=primary]", 1);
await wait(admin, 700);
check("admin : passé en public", artifacts.find((a) => a.slug === "ma-chambre").visibility === "public");
sel = await selected();
check("admin : ajouté en fin de vitrine, titre court proposé", sel.at(-1)?.slug === "ma-chambre" && sel.at(-1).text.includes("Ma chambre") && !sel.at(-1).text.includes("plan 3D"), sel.at(-1)?.text);

// Menu de visibilité (écrit tout l'objet de filtre d'un coup)
await admin.evaluate(() => window.SonicPublisherManager.get("showcaseFilter").set({q: "", visibility: "private", place: "all"}));
await wait(admin, 300);
cat = await catalogue();
check("admin : filtre de visibilité", cat.length === 1 && cat[0].slug === "notes-privees", cat.map((c) => c.slug).join(","));
await admin.evaluate(() => window.SonicPublisherManager.get("showcaseFilter").set({q: "", visibility: "all", place: "on"}));
await wait(admin, 300);
cat = await catalogue();
check("admin : filtre « sur l'accueil »", cat.map((c) => c.slug).join(",") === "billard-3d,pumpkin-run,ma-chambre", cat.map((c) => c.slug).join(","));

// Ordre : monter la dernière carte
await click(admin, "section[aria-labelledby=sel-title] li.row:last-child sonic-button[aria-label=Monter]");
await wait(admin, 300);
sel = await selected();
check("admin : monter change l'ordre", sel.map((s) => s.slug).join(",") === "billard-3d,ma-chambre,pumpkin-run", sel.map((s) => s.slug).join(","));

// Modale de réglage de la carte
await click(admin, "section[aria-labelledby=sel-title] li.row sonic-button[aria-label='Modifier la carte']", 1);
await wait(admin, 500);
await typeIn(admin, "sonic-input[name=kind]", "Maison");
await typeIn(admin, "sonic-textarea[name=blurb]", "Sa chambre, au doigt.");
await shot(admin, "showcase-admin-edit.png");
await click(admin, "sonic-modal-actions sonic-button[type=primary]", 0);
await wait(admin, 400);
sel = await selected();
check("admin : la modale règle genre et accroche", sel[1]?.text.includes("Maison") && sel[1]?.text.includes("Sa chambre, au doigt."), sel[1]?.text);

// À la une : une seule carte
await click(admin, "section[aria-labelledby=sel-title] li.row button.une", 1);
await wait(admin, 300);
sel = await selected();
check("admin : une seule carte à la une", sel.filter((s) => s.une).map((s) => s.slug).join(",") === "ma-chambre", sel.filter((s) => s.une).map((s) => s.slug).join(","));

// Retrait depuis la sélection
await click(admin, "section[aria-labelledby=sel-title] li.row sonic-button[aria-label='Retirer de la vitrine']", 0);
await wait(admin, 300);
sel = await selected();
check("admin : retirer enlève la carte", sel.map((s) => s.slug).join(",") === "ma-chambre,pumpkin-run", sel.map((s) => s.slug).join(","));

// Publication
await click(admin, "sonic-button[data-save]");
await wait(admin, 700);
const last = writes.at(-1);
check("admin : publication = PATCH de l'enregistrement", last?.method === "PATCH" && last.data.une === "ma-chambre" && last.data.items.map((i) => i.slug).join(",") === "ma-chambre,pumpkin-run", JSON.stringify(last));
check("admin : toast de confirmation", (await all(admin, "p.toast")).some((t) => t.text.includes("publiée")));
await shot(admin, "showcase-admin-saved.png");

await page.reload();
await wait(page, 1500);
cards = await all(page, "a[data-featured]");
check("accueil : montre la vitrine publiée", cards.map((c) => c.slug).join(",") === "ma-chambre,pumpkin-run" && cards[0].une, cards.map((c) => c.slug).join(","));

// ── Bibliothèque : la recherche filtre (le champ écrit `q` seul dans le DataProvider) ──
await admin.goto(`${origin}/admin`);
await wait(admin, 1800);
const rows = async () => (await all(admin, "sonic-button.open")).length;
const before = await rows();
await admin.locator('sonic-input input[name="q"]').fill("pumpkin");
await wait(admin, 500);
check("bibliothèque : la recherche filtre la liste", before === 5 && (await rows()) === 1, `${before} → ${await rows()}`);

// ── Édition : modifier un champ active « Enregistrer » ──
await admin.goto(`${origin}/admin/billard-3d/edit`);
await wait(admin, 1800);
const saveOff = async () => (await all(admin, "artifact-edit-page sonic-button[type=primary], sonic-button[type=primary][loading], .form-actions sonic-button[type=primary]"))[0]?.disabled;
check("édition : rien à enregistrer à l'ouverture", (await saveOff()) === true);
await admin.locator('sonic-input input[name="title"]').fill("Billard !");
await wait(admin, 400);
check("édition : un champ modifié active Enregistrer", (await saveOff()) === false);

check("aucune erreur de page", errors.length === 0, errors.join(" | "));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est bon.");
process.exit(failures ? 1 : 0);
