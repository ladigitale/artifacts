/**
 * Smoke test de l'interface MCP Apps de Tadaaa (`ui://tadaaa/artifact-runner`, run_artifact mode embed).
 *
 * Prérequis :
 *   VITE_API_BASE_URL=http://localhost:4455 yarn build
 *   HTML rendu par Tadaaa (apps/api) :
 *     php -r 'require "vendor/autoload.php"; echo App\\Mcp\\Processor\\ArtifactRunnerUiProcessor::render(
 *       file_get_contents("src/Mcp/Ui/artifact-runner.html"), "http://localhost:4455", "http://localhost:4455");' > /tmp/runner.html
 * Lancer : CHROME_PATH=…/chrome RUNNER_HTML=/tmp/runner.html node scripts/smoke-mcp-app.mjs
 *
 * Hôte simulé (:4466) → iframe sandbox d'une autre origine (:4477) avec le HTML ; viewer et API sur :4455.
 * Vérifie : poignée de main ui/initialize → initialized, size-changed après l'initialisation, artefact
 * intégré avec l'entrée du run, sortie postée sur l'API, puis ui/update-model-context et ui/message.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/io.json"), "utf8"));
const RUN = "0190f3a2-1111-7222-8333-944455556666";
const posts = [];
const runner = fs.readFileSync(process.env.RUNNER_HTML || "/tmp/runner.html", "utf8");

const api = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  const cors = {"Access-Control-Allow-Origin": "*"};
  if (q.method === "OPTIONS") { r.writeHead(204, {...cors, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type"}); return r.end(); }
  const run = /^\/api\/public\/artifacts\/io\/runs\/([0-9a-f-]{36})(\/output)?$/.exec(u.pathname);
  if (run) {
    if (q.method === "POST") { let b = ""; q.on("data", (c) => (b += c)); q.on("end", () => { posts.push(JSON.parse(b)); r.writeHead(200, {"Content-Type": "application/json", ...cors}); r.end('{"status":"completed"}'); }); return; }
    r.writeHead(200, {"Content-Type": "application/json", ...cors});
    return r.end(JSON.stringify({runId: RUN, status: "pending", input: {values: [1, 2, 4]}}));
  }
  if (u.pathname.startsWith("/api/public/artifacts/io")) {
    r.writeHead(200, {"Content-Type": "application/json", ...cors});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    return r.end(JSON.stringify({id: "io", slug: "io", title: doc.title, description: "", visibility: "public", document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
  }
  let f = path.join(DIST, u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  const t = f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".svg") ? "image/svg+xml" : "text/html";
  r.writeHead(200, {"Content-Type": t, ...cors});
  r.end(fs.readFileSync(f));
}).listen(4455);

// Origine du « sandbox » (différente de l'hôte et du viewer)
const sandbox = http.createServer((q, r) => { r.writeHead(200, {"Content-Type": "text/html"}); r.end(runner); }).listen(4477);
const host = http.createServer((q, r) => {
  r.writeHead(200, {"Content-Type": "text/html"});
  r.end(`<!doctype html><meta charset=utf-8><body><iframe id=f src="http://localhost:4477/" style="width:800px;height:500px" sandbox="allow-scripts allow-same-origin"></iframe>
<script>
window.log = [];
const f = document.getElementById("f");
const send = (m) => f.contentWindow.postMessage(m, "*");
window.addEventListener("message", (e) => {
  if (e.source !== f.contentWindow) return;
  const m = e.data; window.log.push(m);
  if (m.method === "ui/initialize") send({jsonrpc: "2.0", id: m.id, result: {protocolVersion: "2026-01-26", hostInfo: {name: "test", version: "1"}, hostCapabilities: {}, hostContext: {theme: "light"}}});
  else if (m.method === "ui/notifications/initialized") {
    send({jsonrpc: "2.0", method: "ui/notifications/tool-input", params: {arguments: {slug: "io", input: {values: [1, 2, 4]}, mode: "embed"}}});
    send({jsonrpc: "2.0", method: "ui/notifications/tool-result", params: {content: [{type: "text", text: "{}"}], structuredContent: {runId: "${RUN}", slug: "io", mode: "embed", status: "pending", runToken: "tok", title: "Somme à valider"}}});
  } else if (m.id != null && m.method) send({jsonrpc: "2.0", id: m.id, result: {}});
});
</script>`);
}).listen(4466);

let failures = 0;
const check = (l, ok, d = "") => { console.log(`${ok ? "✔" : "✘"} ${l}${d ? "  — " + d : ""}`); if (!ok) failures++; };
const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"]});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto("http://localhost:4466/");
await page.waitForTimeout(3500);
const frame = page.frames().find((fr) => fr.url().startsWith("http://localhost:4477"));
const deep = (sel) => frame.evaluate((sel) => {
  const d = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) d(e.shadowRoot, s, a); }); return a; };
  return d(document, sel).map((e) => (e.shadowRoot?.textContent || e.textContent || "").trim());
}, sel);
let log = await page.evaluate(() => window.log.map((m) => m.method || "response"));
check("ui/initialize puis initialized", log[0] === "ui/initialize" && log[1] === "ui/notifications/initialized", JSON.stringify(log));
check("size-changed envoyé", log.includes("ui/notifications/size-changed"));
check("artefact intégré, entrée du run appliquée (7)", (await deep("#total"))[0] === "7", JSON.stringify(await deep("#total")));
await frame.evaluate(() => {
  const d = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) d(e.shadowRoot, s, a); }); return a; };
  const el = d(document, "#valider")[0]; (el.shadowRoot?.querySelector("button") ?? el).click();
});
await page.waitForTimeout(1500);
check("sortie postée sur l'API", posts.length === 1 && posts[0].output === 7 && posts[0].rt === "tok", JSON.stringify(posts));
const full = await page.evaluate(() => window.log);
const ctx = full.find((m) => m.method === "ui/update-model-context");
const msgm = full.find((m) => m.method === "ui/message");
check("ui/update-model-context avec la sortie", ctx?.params?.structuredContent?.output === 7, JSON.stringify(ctx?.params));
check("ui/message au modèle", msgm?.params?.role === "user" && /7/.test(msgm?.params?.content?.text ?? ""), JSON.stringify(msgm?.params));
check("aucune erreur", errors.length === 0, errors.join(" | "));
await page.screenshot({path: "/tmp/smoke-mcp-app.png"});
await browser.close(); api.close(); sandbox.close(); host.close();
process.exit(failures ? 1 : 0);
