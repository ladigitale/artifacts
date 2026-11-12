/**
 * Smoke test du contrat `io` dans le viewer (artefact utilisé comme outil).
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : CHROME_PATH=…/chrome node scripts/smoke-io.mjs
 *
 * Vérifie : run serveur (`?run=&rt=`) — entrée lue sur l'API et envoyée au store, aucune sortie
 * avant `when`, sortie publiée une seule fois au clic « Valider », bandeau d'état, événement
 * `artifact-output` ; run déjà terminé (bandeau, rien d'envoyé) ; embed avec entrée locale
 * (`data-input`) — événement sur <artifact-embed>, aucun appel aux runs.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/io.json"), "utf8"));
const RUN = "0190f3a2-1111-7222-8333-944455556666";
const DONE = "0190f3a2-1111-7222-8333-944455557777";
const CANCELLED = "0190f3a2-1111-7222-8333-944455558888";
const posts = [];
const files = [];
const runGets = [];

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  const cors = {"Access-Control-Allow-Origin": "*"};
  if (q.method === "OPTIONS") {
    r.writeHead(204, {...cors, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type"});
    return r.end();
  }
  const file = /^\/api\/public\/artifacts\/io\/runs\/([0-9a-f-]{36})\/files\/([a-z0-9._-]+)$/.exec(u.pathname);
  if (file && q.method === "POST") {
    const chunks = [];
    q.on("data", (c) => chunks.push(c));
    q.on("end", () => {
      const bytes = Buffer.concat(chunks);
      files.push({run: file[1], name: file[2], type: q.headers["content-type"], rt: u.searchParams.get("rt"), png: bytes.subarray(1, 4).toString() === "PNG", at: posts.length});
      r.writeHead(201, {"Content-Type": "application/json", ...cors});
      r.end(JSON.stringify({name: file[2]}));
    });
    return;
  }
  const run = /^\/api\/public\/artifacts\/io\/runs\/([0-9a-f-]{36})(\/output)?$/.exec(u.pathname);
  if (run) {
    if (q.method === "POST") {
      let body = "";
      q.on("data", (c) => (body += c));
      q.on("end", () => {
        posts.push({run: run[1], body: JSON.parse(body)});
        r.writeHead(200, {"Content-Type": "application/json", ...cors});
        r.end(JSON.stringify({runId: run[1], status: "completed"}));
      });
      return;
    }
    runGets.push({run: run[1], rt: u.searchParams.get("rt")});
    r.writeHead(200, {"Content-Type": "application/json", ...cors});
    return r.end(JSON.stringify(run[1] === RUN
      ? {runId: RUN, slug: "io", mode: "interactive", status: "pending", input: {values: [1, 2, 4]}}
      : {runId: run[1], slug: "io", mode: "interactive", status: run[1] === CANCELLED ? "cancelled" : "completed"}));
  }
  if (/^\/api\/public\/artifacts\/io/.test(u.pathname)) {
    // Jeton de compte périmé : l'API refuse la requête authentifiée.
    if (q.headers.authorization === "Bearer perime") {
      r.writeHead(401, {"Content-Type": "application/json", ...cors});
      return r.end('{"message":"JWT expired"}');
    }
    r.writeHead(200, {"Content-Type": "application/json", ...cors});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    return r.end(JSON.stringify({id: "io", slug: "io", title: doc.title, description: "", visibility: "public", document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
  }
  if (u.pathname === "/host.html") {
    r.writeHead(200, {"Content-Type": "text/html"});
    return r.end(`<!doctype html><meta charset="utf-8"><body><h1>Hôte</h1>
<script>window.__outputs = []; document.addEventListener("artifact-output", (e) => window.__outputs.push(e.detail));</script>
<script src="/embed.js" data-artifact="io" data-input='{"values":[10,20]}' async></script></body>`);
  }
  if (u.pathname === "/host-sans-entree.html") {
    r.writeHead(200, {"Content-Type": "text/html"});
    return r.end(`<!doctype html><meta charset="utf-8"><body>
<script>window.__outputs = []; document.addEventListener("artifact-output", (e) => window.__outputs.push(e.detail));</script>
<script src="/embed.js" data-artifact="io" async></script></body>`);
  }
  let f = path.join(DIST, u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  const t = f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".svg") ? "image/svg+xml" : "text/html";
  r.writeHead(200, {"Content-Type": t});
  r.end(fs.readFileSync(f));
}).listen(PORT);

let failures = 0;
const check = (label, ok, detail = "") => { console.log(`${ok ? "✔" : "✘"} ${label}${detail ? "  — " + detail : ""}`); if (!ok) failures++; };
const deepText = (p, sel) => p.evaluate((sel) => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  return deep(document, sel).map((e) => ({text: (e.shadowRoot?.textContent || e.textContent || "").trim(), state: e.getAttribute("data-state")}));
}, sel);
const click = (p, sel) => p.evaluate((sel) => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  const el = deep(document, sel)[0];
  (el.shadowRoot?.querySelector("button") ?? el).click();
}, sel);

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"]});
const errors = [];
const page = await browser.newPage({viewport: {width: 900, height: 600}});
page.on("pageerror", (e) => errors.push(String(e)));
await page.addInitScript(() => {
  window.__outputs = [];
  document.addEventListener("artifact-output", (e) => window.__outputs.push(e.detail));
});

// 1. Run interactif
await page.goto(`http://localhost:${PORT}/io?run=${RUN}&rt=tok`);
await page.waitForTimeout(2000);
check("entrée lue avec le jeton du run", runGets.some((g) => g.run === RUN && g.rt === "tok"), JSON.stringify(runGets));
const total = await deepText(page, "#total");
check("entrée envoyée au store (total = 7)", total[0]?.text === "7", JSON.stringify(total));
let banner = await deepText(page, ".artifact-io-status");
check("bandeau « tâche en cours »", banner[0]?.state === "waiting", JSON.stringify(banner));
check("aucune sortie avant when", posts.length === 0, JSON.stringify(posts));

await click(page, "#valider");
await page.waitForTimeout(1200);
check("sortie publiée une fois", posts.length === 1 && posts[0].body.rt === "tok" && posts[0].body.output === 7, JSON.stringify(posts));
check("fichier de sortie envoyé avant la sortie (image.png, PNG, jeton)", files.length === 1 && files[0].name === "image.png" && files[0].type === "image/png" && files[0].png && files[0].rt === "tok" && files[0].at === 0, JSON.stringify(files));
banner = await deepText(page, ".artifact-io-status");
check("bandeau « résultat transmis »", banner[0]?.state === "done", JSON.stringify(banner));
const outs = await page.evaluate(() => window.__outputs);
check("événement artifact-output (avec les fichiers)", outs.length === 1 && outs[0].output === 7 && outs[0].runId === RUN && /^data:image\/png/.test(outs[0].files?.image ?? ""), JSON.stringify(outs).slice(0, 300));
await click(page, "#valider");
await page.waitForTimeout(600);
check("pas de second envoi", posts.length === 1);
await page.screenshot({path: "/tmp/smoke-io.png"});

// 2. Run déjà terminé
await page.goto(`http://localhost:${PORT}/io?run=${DONE}&rt=tok`);
await page.waitForTimeout(1800);
banner = await deepText(page, ".artifact-io-status");
check("run terminé : bandeau, entrée non envoyée", banner[0]?.state === "closed" && (await deepText(page, "#total"))[0]?.text === "", JSON.stringify(banner));

// 2 bis. Run annulé
await page.goto(`http://localhost:${PORT}/io?run=${CANCELLED}&rt=tok`);
await page.waitForTimeout(1800);
banner = await deepText(page, ".artifact-io-status");
check("run annulé : bandeau « annulée »", banner[0]?.state === "closed" && /annulée/.test(banner[0]?.text ?? ""), JSON.stringify(banner));

// 3. Page sans run : aucun bandeau, aucun appel
const before = runGets.length;
await page.goto(`http://localhost:${PORT}/io`);
await page.waitForTimeout(1500);
check("sans run : ni bandeau ni appel", (await deepText(page, ".artifact-io-status")).length === 0 && runGets.length === before);

// 4. Embed, entrée locale
const host = await browser.newPage();
host.on("pageerror", (e) => errors.push(String(e)));
await host.goto(`http://localhost:${PORT}/host.html`);
await host.waitForTimeout(2500);
const embTotal = await deepText(host, "#total");
check("embed : entrée locale envoyée au store (30)", embTotal[0]?.text === "30", JSON.stringify(embTotal));
await click(host, "#valider");
await host.waitForTimeout(800);
const hostOuts = await host.evaluate(() => window.__outputs);
check("embed : artifact-output reçu par la page hôte", hostOuts.length === 1 && hostOuts[0].output === 30 && hostOuts[0].runId === null, JSON.stringify(hostOuts));
check("embed : aucun appel aux runs ni POST", runGets.length === before && posts.length === 1 && files.length === 1);

// 5. Embed sans entrée : la sortie est émise quand when devient vraie
const host2 = await browser.newPage();
host2.on("pageerror", (e) => errors.push(String(e)));
await host2.goto(`http://localhost:${PORT}/host-sans-entree.html`);
await host2.waitForTimeout(2500);
check("embed sans entrée : rien d'émis avant when", (await host2.evaluate(() => window.__outputs.length)) === 0);
await click(host2, "#valider");
await host2.waitForTimeout(800);
const outs2 = await host2.evaluate(() => window.__outputs);
check("embed sans entrée : artifact-output émis", outs2.length === 1 && outs2[0].runId === null, JSON.stringify(outs2).slice(0, 200));

// 6. Compte local au jeton périmé : la lecture publique (artefact, run) passe quand même
const stale = await browser.newPage();
stale.on("pageerror", (e) => errors.push(String(e)));
await stale.goto(`http://localhost:${PORT}/`);
await stale.evaluate((port) => localStorage.setItem("artifacts-account", JSON.stringify({apiBaseUrl: `http://localhost:${port}`, token: "perime", user: {email: "a@b.c"}})), PORT);
await stale.goto(`http://localhost:${PORT}/io?run=${RUN}&rt=tok`);
await stale.waitForTimeout(2000);
check("jeton périmé : artefact affiché quand même (total = 7)", (await deepText(stale, "#total"))[0]?.text === "7", JSON.stringify(await deepText(stale, "#total")));
check("jeton périmé : compte local retiré", (await stale.evaluate(() => localStorage.getItem("artifacts-account"))) === null);

check("aucune erreur de page", errors.length === 0, errors.join(" | "));
await browser.close();
server.close();
process.exit(failures ? 1 : 0);
