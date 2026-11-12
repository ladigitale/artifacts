/**
 * Smoke test des pièces jointes et des étapes dans le chat de l'atelier (sonic-chat `attachments`).
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : CHROME_PATH=…/chrome node scripts/smoke-atelier-attachments.mjs
 *
 * Vérifie : long texte collé replié en pièce jointe « Texte collé », image jointe par le
 * sélecteur (vignette), envoi en InputContent AG-UI (document text/plain + image), rappel des
 * pièces jointes dans la bulle, étapes regroupées et dépliables (paramètres, résultat), historique
 * allégé au message suivant.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const bodies = [];
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

const server = http.createServer(async (q, r) => {
  const u = new URL(q.url, "http://x");
  const cors = {"Access-Control-Allow-Origin": "*"};
  if (q.method === "OPTIONS") {
    r.writeHead(204, {...cors, "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE"});
    return r.end();
  }
  if (u.pathname === "/api/agent/artifacts/run") {
    let body = "";
    for await (const c of q) body += c;
    const input = JSON.parse(body);
    bodies.push(input);
    r.writeHead(200, {"Content-Type": "text/event-stream", ...cors});
    const events = [
      {type: "RUN_STARTED", threadId: input.threadId, runId: input.runId},
      {type: "TOOL_CALL_START", toolCallId: "t1", toolCallName: "find_icons"},
      {type: "TOOL_CALL_ARGS", toolCallId: "t1", delta: JSON.stringify({query: "maison"})},
      {type: "TOOL_CALL_END", toolCallId: "t1"},
      {type: "TOOL_CALL_RESULT", messageId: "r1", toolCallId: "t1", role: "tool", content: JSON.stringify({icons: ["home", "home-alt"]})},
      {type: "TOOL_CALL_START", toolCallId: "t2", toolCallName: "search_public_apis"},
      {type: "TOOL_CALL_ARGS", toolCallId: "t2", delta: JSON.stringify({query: "météo"})},
      {type: "TOOL_CALL_END", toolCallId: "t2"},
      {type: "TOOL_CALL_RESULT", messageId: "r2", toolCallId: "t2", role: "tool", content: "[]"},
      {type: "TEXT_MESSAGE_START", messageId: `m${bodies.length}`, role: "assistant"},
      {type: "TEXT_MESSAGE_CONTENT", messageId: `m${bodies.length}`, delta: "Bien reçu."},
      {type: "TEXT_MESSAGE_END", messageId: `m${bodies.length}`},
      {type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId},
    ];
    for (const e of events) r.write(`data: ${JSON.stringify(e)}\n\n`);
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

check("bouton « Joindre un fichier »", await ev(`return all(document, "sonic-chat [data-chat-attach-btn]").length === 1;`));

// 1. Long texte collé
const pasted = Array.from({length: 120}, (_, i) => `ligne ${i + 1} ; valeur ${i * 3}`).join("\n");
await ev(`const t = all(document, "sonic-chat textarea")[0]; const dt = new DataTransfer(); dt.setData("text/plain", arg); t.focus(); t.dispatchEvent(new ClipboardEvent("paste", {clipboardData: dt, bubbles: true, cancelable: true}));`, pasted);
await page.waitForTimeout(300);
const chip = await ev(`const c = all(document, "sonic-chat form [data-chat-attachment]")[0]; return c ? c.textContent.replace(/\\s+/g, " ").trim() : null;`);
check("collé long replié en pièce jointe", /Texte collé/.test(chip ?? "") && /120 lignes/.test(chip ?? ""), chip);
check("saisie restée vide", (await ev(`return all(document, "sonic-chat textarea")[0].value;`)) === "");

// 2. Image par le sélecteur
const input = await page.evaluateHandle(new Function(deepJs + `return all(document, "sonic-chat input[type=file]")[0];`));
await input.asElement().setInputFiles({name: "pixel.png", mimeType: "image/png", buffer: PNG});
await page.waitForTimeout(500);
check("image jointe avec vignette", await ev(`return all(document, "sonic-chat form [data-chat-attachment][data-kind=image] img").length === 1;`));

// 3. Envoi
const ta = await page.evaluateHandle(new Function(deepJs + `return all(document, "sonic-chat textarea")[0];`));
await ta.asElement().fill("Fais un tableau de ces valeurs");
await ta.asElement().press("Enter");
await page.waitForTimeout(1500);
const parts = bodies[0]?.messages?.[0]?.content;
check("envoi en InputContent (texte, document, image)", Array.isArray(parts) && parts.map((p) => p.type).join(",") === "text,document,image", JSON.stringify(parts?.map((p) => ({type: p.type, mime: p.source?.mimeType, name: p.metadata?.filename}))));
check("texte collé en UTF-8 base64", parts && Buffer.from(parts[1].source.value, "base64").toString("utf8") === pasted);
check("pièces jointes rappelées dans la bulle", await ev(`return all(document, "sonic-chat [data-chat-msg=user] [data-chat-attachment]").length === 2;`));
check("saisie vidée de ses pièces jointes", await ev(`return all(document, "sonic-chat form [data-chat-attachment]").length === 0;`));

// 4. Étapes
const group = await ev(`const g = all(document, "sonic-chat details[data-chat-steps]")[0]; return g ? {open: g.open, summary: g.querySelector("summary").textContent.replace(/\\s+/g, " ").trim()} : null;`);
check("étapes regroupées et repliées en fin de run", group && /2 étapes/.test(group.summary) && group.open === false, JSON.stringify(group));
await ev(`const g = all(document, "sonic-chat details[data-chat-steps]")[0]; g.querySelector("summary").click();`);
await page.waitForTimeout(200);
await ev(`const s = all(document, "sonic-chat details[data-chat-tool]")[0]; s.querySelector("summary").click();`);
await page.waitForTimeout(200);
const detail = await ev(`const d = all(document, "sonic-chat details[data-chat-tool] [data-chat-tool-detail]")[0]; return d ? d.textContent : "";`);
check("étape dépliée : paramètres et résultat", /maison/.test(detail) && /home-alt/.test(detail), detail.slice(0, 160));

// 5. Message suivant : historique allégé
await ta.asElement().fill("Merci");
await ta.asElement().press("Enter");
await page.waitForTimeout(1500);
const first = bodies[1]?.messages?.[0]?.content;
check("historique allégé au run suivant", typeof first === "string" && /pièce jointe déjà envoyée : pixel\.png/.test(first), String(first).slice(0, 200));
check("aucune erreur de page", errors.length === 0, errors.join(" | "));
await page.screenshot({path: "/tmp/smoke-atelier-attachments.png"});
await browser.close();
server.close();
process.exit(failures ? 1 : 0);
