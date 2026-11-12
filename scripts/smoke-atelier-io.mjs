/**
 * Smoke test de l'essai d'un contrat `io` dans l'atelier (« Tester comme outil »).
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : CHROME_PATH=…/chrome node scripts/smoke-atelier-io.mjs
 *
 * Fausse API : l'agent renvoie l'aperçu tests/fixtures/io.json. Vérifie : panneau affiché pour un
 * brouillon qui déclare io, entrée d'exemple tirée du schéma, essai avec une autre entrée (le
 * store la reçoit), sortie affichée quand when devient vraie, aucun appel aux runs.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/io.json"), "utf8"));
const runCalls = [];

const server = http.createServer(async (q, r) => {
  const u = new URL(q.url, "http://x");
  const cors = {"Access-Control-Allow-Origin": "*"};
  if (q.method === "OPTIONS") {
    r.writeHead(204, {...cors, "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE"});
    return r.end();
  }
  if (u.pathname.includes("/runs/")) runCalls.push(u.pathname);
  if (u.pathname === "/api/agent/artifacts/run") {
    let body = "";
    for await (const c of q) body += c;
    const input = JSON.parse(body);
    r.writeHead(200, {"Content-Type": "text/event-stream", ...cors});
    for (const e of [
      {type: "RUN_STARTED", threadId: input.threadId, runId: input.runId},
      {type: "CUSTOM", name: "artifact-preview", value: {document: doc}},
      {type: "TEXT_MESSAGE_START", messageId: "m1", role: "assistant"},
      {type: "TEXT_MESSAGE_CONTENT", messageId: "m1", delta: "Voici l’outil."},
      {type: "TEXT_MESSAGE_END", messageId: "m1"},
      {type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId},
    ]) r.write(`data: ${JSON.stringify(e)}\n\n`);
    return r.end();
  }
  if (u.pathname === "/api/agent/settings") {
    r.writeHead(200, {"Content-Type": "application/json", ...cors});
    return r.end(JSON.stringify({configured: true, serverKeyAvailable: false, provider: "anthropic", model: ""}));
  }
  if (u.pathname === "/api/agent/artifacts/threads") {
    r.writeHead(200, {"Content-Type": "application/json", ...cors});
    return r.end('{"threads":[]}');
  }
  if (u.pathname.startsWith("/api/")) {
    r.writeHead(200, {"Content-Type": "application/json", ...cors});
    return r.end(u.pathname === "/api/artifacts" ? "[]" : "{}");
  }
  let f = path.join(DIST, u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  const t = f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".svg") ? "image/svg+xml" : "text/html";
  r.writeHead(200, {"Content-Type": t});
  r.end(fs.readFileSync(f));
}).listen(PORT);

const deepJs = `const all = (r, sel, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(sel)) a.push(e); if (e.shadowRoot) all(e.shadowRoot, sel, a); }); return a; };`;
let failures = 0;
const check = (label, ok, detail = "") => { console.log(`${ok ? "✔" : "✘"} ${label}${detail ? "  — " + detail : ""}`); if (!ok) failures++; };
const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"]});
const page = await (await browser.newContext({viewport: {width: 1280, height: 900}})).newPage();
const ev = (fn, arg) => page.evaluate(new Function("arg", deepJs + fn), arg);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/`);
await page.evaluate((port) => localStorage.setItem("artifacts-account", JSON.stringify({apiBaseUrl: `http://localhost:${port}`, token: "tok", user: {email: "smoke@example.org"}})), PORT);
await page.goto(`http://localhost:${PORT}/admin/atelier`);
await page.waitForTimeout(2000);
const ta = await page.evaluateHandle(new Function(deepJs + `return all(document, "sonic-chat textarea")[0];`));
await ta.asElement().fill("Un outil qui additionne");
await ta.asElement().press("Enter");
await page.waitForTimeout(2500);

check("panneau « Tester comme outil » affiché", await ev(`return all(document, "[data-io-test]").length === 1;`));
await ev(`all(document, "[data-io-test] summary")[0].click();`);
await page.waitForTimeout(300);
const sample = await ev(`return all(document, "[data-io-input]")[0]?.value;`);
check("entrée d'exemple tirée du schéma", JSON.stringify(JSON.parse(sample ?? "null")) === '{"values":[1]}', sample);

await ev(`const t = all(document, "[data-io-input]")[0]; t.value = '{"values":[5,6]}'; t.dispatchEvent(new Event("input", {bubbles: true, composed: true}));`);
await ev(`const b = all(document, "[data-io-run]")[0]; (b.shadowRoot?.querySelector("button") ?? b).click();`);
await page.waitForTimeout(2000);
const total = await ev(`return all(document, "#total").map((e) => (e.shadowRoot?.textContent || e.textContent || "").trim());`);
check("l'aperçu reçoit l'entrée d'essai (11)", total[0] === "11", JSON.stringify(total));
check("pas de sortie avant when", await ev(`return all(document, "[data-io-output]").length === 0;`));

await ev(`const b = all(document, "#valider")[0]; (b.shadowRoot?.querySelector("button") ?? b).click();`);
await page.waitForTimeout(800);
const out = await ev(`return all(document, "[data-io-output]")[0]?.textContent.trim();`);
check("sortie affichée (11)", out === "11", out);
check("fichier de sortie affiché", await ev(`return all(document, ".io-files img").length === 1;`));
check("aucun appel aux runs depuis l'atelier", runCalls.length === 0, JSON.stringify(runCalls));
check("aucune erreur de page", errors.length === 0, errors.join(" | "));
await page.screenshot({path: "/tmp/smoke-atelier-io.png"});
await browser.close();
server.close();
process.exit(failures ? 1 : 0);
