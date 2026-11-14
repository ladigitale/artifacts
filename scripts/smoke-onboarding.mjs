/**
 * Smoke test du parcours « Démarrer » et de la vitrine de l'accueil.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 VITE_TADAAA_URL=http://localhost:4455 yarn build
 * Lancer   : CHROME_PATH=…/chrome node scripts/smoke-onboarding.mjs
 *
 * Vérifie : accueil (scène physique attrapable, gravité inversable, chasse aux astérisques, vitrine, bouton Commencer), /demarrer hors connexion (étape 1 active, inscription avec
 * retour porté par l'URL), onglets d'assistant et adresse MCP, retour de connexion vers /demarrer
 * (`/cloud?handoff=…&next=/demarrer`), création du jeton Cursor, détection du premier artefact.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const SHOTS = process.env.SHOTS_DIR || "";
let published = false;
const artifact = {id: "a1", slug: "quiz-chateaux", title: "Quiz — châteaux de la Loire", visibility: "private", url: `http://localhost:${PORT}/quiz-chateaux`, updatedAt: new Date().toISOString()};

const json = (r, body, status = 200) => { r.writeHead(status, {"Content-Type": "application/json"}); r.end(JSON.stringify(body)); };
const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  if (u.pathname === "/api/auth/handoff/exchange") return json(r, {token: "jwt", user: {email: "ami@example.org"}});
  if (u.pathname === "/api/artifacts") return json(r, {member: published ? [artifact] : []});
  if (u.pathname === "/api/access-tokens" && q.method === "POST") return json(r, {plainToken: "tada_test123", mcpUrl: `http://localhost:${PORT}/mcp`, token: {}}, 201);
  if (u.pathname === "/api/appearance") {
    // Compte resté sur le « default » de Tadaaa (violet) ; le thème maison est servi à la demande.
    const id = u.searchParams.get("theme") || "default";
    const primary = id === "affiche" ? "#17130e" : "#4f1fff";
    return json(r, {themeId: id, label: id, dark: false, vars: {"--sc-primary": primary}, fontsCssUrl: null, shell: {contentMaxWidth: "72rem", menuPosition: "start"}});
  }
  if (u.pathname.startsWith("/api/")) return json(r, {configured: false, serverKeyAvailable: false, member: []});
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
const deepFn = `const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };`;
const q = (p, sel) => p.evaluate(new Function("sel", `${deepFn} return deep(document, sel).map((e) => ({text: e.textContent.trim(), state: e.getAttribute("data-state"), selected: e.getAttribute("aria-selected"), href: e.getAttribute("href")}));`), sel);
const click = (p, sel) => p.evaluate(new Function("sel", `${deepFn} const el = deep(document, sel)[0]; if (!el) throw new Error("absent : " + sel); (el.shadowRoot?.querySelector("button") ?? el).click();`), sel);
const shot = async (p, name) => { if (SHOTS) await p.screenshot({path: path.join(SHOTS, name), fullPage: false}); };
const origin = `http://localhost:${PORT}`;

const ctx = await browser.newContext({viewport: {width: 1100, height: 900}});
await ctx.grantPermissions(["clipboard-read", "clipboard-write"], {origin});
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(String(e)));

// Accueil
await page.goto(`${origin}/`);
await page.waitForTimeout(1200);
const themeOf = (p) => p.evaluate(() => `${document.documentElement.getAttribute("data-theme")} ${getComputedStyle(document.documentElement).getPropertyValue("--sc-primary").trim()}`);
check("accueil : thème maison appliqué", (await themeOf(page)) === "affiche #17130e", await themeOf(page));
const cards = await q(page, "a[data-featured]");
check("accueil : vitrine de 5 artefacts", cards.length === 5, cards.map((c) => c.href).join(" "));
await page.waitForTimeout(2500);
const tiles = await q(page, "sonic-stage > div");
check("accueil : scène creative-stack montée (9 éléments posés par la physique)", tiles.length === 9, String(tiles.length));
const idee = await page.evaluate(new Function(`${deepFn} const b = deep(document, "#idee")[0].getBoundingClientRect(); return {x: b.x + b.width / 2, y: b.y + b.height / 2};`));
await page.mouse.move(idee.x, idee.y);
await page.mouse.down();
await page.mouse.move(idee.x - 40, idee.y - 140, {steps: 10});
await page.waitForTimeout(250);
const held = await page.evaluate(new Function(`${deepFn} const b = deep(document, "#idee")[0].getBoundingClientRect(); return {y: b.y + b.height / 2};`));
await page.mouse.up();
check("accueil : un mot se laisse attraper et soulever", idee.y - held.y > 60, `${Math.round(idee.y)} → ${Math.round(held.y)}`);
const posY = () => page.evaluate(new Function(`${deepFn} const b = deep(document, "#idee")[0].getBoundingClientRect(); return b.y + b.height / 2;`));
await page.waitForTimeout(1500);
const yRest = await posY();
const sw = await page.evaluate(new Function(`${deepFn} const b = deep(document, "#bascule")[0].getBoundingClientRect(); return {x: b.x + b.width / 2, y: b.y + b.height / 2};`));
await page.mouse.click(sw.x, sw.y);
await page.waitForTimeout(1800);
const yFlip = await posY();
check("accueil : le bouton ↕ inverse la gravité de la pile", yRest - yFlip > 80, `${Math.round(yRest)} → ${Math.round(yFlip)}`);
for (let i = 0; i < 5; i++) await click(page, `[data-star="${i}"]`);
await page.waitForTimeout(300);
check("accueil : les cinq astérisques trouvés affichent la récompense", (await q(page, ".prize")).length === 1);
await shot(page, "accueil.png");
await click(page, "[data-cta='start']");
await page.waitForTimeout(600);
check("accueil : Commencer mène à /demarrer", new URL(page.url()).pathname === "/demarrer", page.url());
check("/demarrer : même thème que l'accueil", (await themeOf(page)) === "affiche #17130e", await themeOf(page));

// Hors connexion
let steps = await q(page, "li.step");
check("hors connexion : étape 1 active, les autres à venir", steps.map((s) => s.state).join(",") === "current,todo,todo", steps.map((s) => s.state).join(","));
const mcp = await q(page, "[data-copy='mcp-url']");
check("adresse MCP affichée", mcp[0]?.text === `${origin}/mcp`, mcp[0]?.text);
await click(page, "[data-client='claude-code']");
await page.waitForTimeout(200);
const cc = await q(page, "[data-copy='cc-add']");
check("onglet Claude Code : commande d'ajout", cc[0]?.text === `claude mcp add --transport http tadaaa ${origin}/mcp`, cc[0]?.text);
await shot(page, "demarrer-hors-connexion.png");
await click(page, "li[data-step='account'] sonic-button");
await page.waitForTimeout(800);
const reg = new URL(page.url());
check("inscription : page Tadaaa avec retour porté par l'URL", reg.pathname === "/account/register" && reg.searchParams.get("return_to") === `${origin}/cloud?next=%2Fdemarrer`, page.url());

// Retour de confirmation dans un nouvel onglet (pas de sessionStorage)
const page2 = await ctx.newPage();
page2.on("pageerror", (e) => errors.push(String(e)));
await page2.goto(`${origin}/cloud?next=%2Fdemarrer&handoff=abc`);
await page2.waitForTimeout(1800);
check("retour de confirmation : arrive sur /demarrer", new URL(page2.url()).pathname === "/demarrer", page2.url());
check("connecté, compte en thème « default » : thème maison conservé", (await themeOf(page2)) === "affiche #17130e", await themeOf(page2));
steps = await q(page2, "li.step");
check("connecté : étape 1 faite, étape 2 active", steps.map((s) => s.state).join(",") === "done,current,todo", steps.map((s) => s.state).join(","));
check("l'onglet choisi est retenu", (await q(page2, "[data-client='claude-code']"))[0]?.selected === "true");

// Refus d'une destination externe
const page3 = await ctx.newPage();
await page3.goto(`${origin}/cloud?next=%2F%2Fevil.example&handoff=abc`);
await page3.waitForTimeout(1500);
check("retour : destination externe refusée", new URL(page3.url()).origin === origin && new URL(page3.url()).pathname === "/admin", page3.url());
await page3.close();

// Cursor : jeton + configuration
await click(page2, "[data-client='cursor']");
await page2.waitForTimeout(200);
await click(page2, "div[role='tabpanel'] sonic-button");
await page2.waitForTimeout(600);
const cfg = (await q(page2, "[data-copy='cursor-json']"))[0]?.text ?? "";
let parsed = null;
try { parsed = JSON.parse(cfg); } catch { /* vide */ }
check("Cursor : configuration JSON avec le jeton", parsed?.mcpServers?.tadaaa?.url === `${origin}/mcp` && parsed?.mcpServers?.tadaaa?.headers?.Authorization === "Bearer tada_test123", cfg.slice(0, 80));
await shot(page2, "demarrer-cursor.png");

// Premier artefact détecté
await click(page2, "[data-client='claude']");
published = true;
await page2.waitForTimeout(6500);
steps = await q(page2, "li.step");
check("premier artefact détecté : trois étapes faites", steps.map((s) => s.state).join(",") === "done,done,done", steps.map((s) => s.state).join(","));
const link = (await q(page2, "[data-first-artifact] a.link"))[0];
check("lien de l'artefact affiché", link?.href === `${origin}/quiz-chateaux`, link?.href);
await shot(page2, "demarrer-publie.png");

// Mobile
const m = await browser.newContext({viewport: {width: 380, height: 760}});
const mp = await m.newPage();
await mp.goto(`${origin}/demarrer`);
await mp.waitForTimeout(1200);
const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check("mobile : pas de débordement horizontal", !overflow);
if (SHOTS) await mp.screenshot({path: path.join(SHOTS, "demarrer-mobile.png")});
await mp.goto(`${origin}/`);
await mp.waitForTimeout(1200);
if (SHOTS) await mp.screenshot({path: path.join(SHOTS, "accueil-mobile.png"), fullPage: true});

check("aucune erreur de page", errors.length === 0, errors.join(" | "));
await browser.close();
server.close();
process.exit(failures ? 1 : 0);
