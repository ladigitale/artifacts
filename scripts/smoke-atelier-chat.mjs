/**
 * Smoke test de la page /admin/atelier (agent de création d'artefacts).
 *
 * Prérequis :
 *   VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer :
 *   node scripts/smoke-atelier-chat.mjs
 *
 * Sert dist/ + une fausse API Tadaaa dont `/api/agent/artifacts/run` rejoue un flux
 * AG-UI (aperçu `artifact-preview` de tests/fixtures/a2ui-reservation.json, puis une
 * interface A2UI « Publier »). Vérifie : jeton envoyé, message affiché, aperçu rendu par
 * le viewer (et jouable), clic « Publier » renvoyé à l'agent comme action A2UI.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/a2ui-reservation.json"), "utf8"));
const runs = [];
let settingsConfigured = true;

const sse = (r, events) => {
  r.writeHead(200, {"Content-Type": "text/event-stream", "Access-Control-Allow-Origin": "*"});
  for (const e of events) r.write(`data: ${JSON.stringify(e)}\n\n`);
  r.end();
};

/** Historique : fausse table des conversations (threadId -> fiche). */
const threads = new Map();
const json = (r, status, body) => {
  r.writeHead(status, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
  r.end(body === undefined ? "" : JSON.stringify(body));
};

/** Comme sse(), avec une pause avant chaque événement dont `delays[i]` > 0 (pour voir l'état d'attente). */
const sseSlow = async (r, events, delays) => {
  r.writeHead(200, {"Content-Type": "text/event-stream", "Access-Control-Allow-Origin": "*"});
  for (const [i, e] of events.entries()) {
    if (delays[i]) await new Promise((res) => setTimeout(res, delays[i]));
    r.write(`data: ${JSON.stringify(e)}\n\n`);
  }
  r.end();
};

const server = http.createServer(async (q, r) => {
  const u = new URL(q.url, "http://x");
  if (q.method === "OPTIONS") {
    r.writeHead(204, {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE"});
    return r.end();
  }
  if (u.pathname === "/api/agent/artifacts/run") {
    let body = "";
    for await (const c of q) body += c;
    const input = JSON.parse(body);
    runs.push({auth: q.headers.authorization, input});
    if (!threads.has(input.threadId)) {
      const first = input.messages.find((m) => m.role === "user")?.content ?? "Sans titre";
      threads.set(input.threadId, {threadId: input.threadId, title: first, artifactSlug: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()});
    }
    if (input.forwardedProps?.a2uiAction) {
      return sse(r, [
        {type: "TEXT_MESSAGE_START", messageId: "m3", role: "assistant"},
        {type: "TEXT_MESSAGE_CONTENT", messageId: "m3", delta: "Publié."},
        {type: "TEXT_MESSAGE_END", messageId: "m3"},
        {type: "CUSTOM", name: "artifact-published", value: {slug: "reservation-orchestre", url: "https://artifacts.example/reservation-orchestre", version: 1}},
      ]);
    }
    return sseSlow(r, [
      {type: "RUN_STARTED", threadId: input.threadId, runId: input.runId},
      {type: "TOOL_CALL_START", toolCallId: "p", toolCallName: "preview_artifact"},
      {type: "CUSTOM", name: "artifact-preview", value: {document: doc}},
      {type: "TOOL_CALL_END", toolCallId: "p"},
      {type: "TEXT_MESSAGE_START", messageId: "m1", role: "assistant"},
      {type: "TEXT_MESSAGE_CONTENT", messageId: "m1", delta: "Voici une page de réservation."},
      {type: "TEXT_MESSAGE_END", messageId: "m1"},
      {type: "CUSTOM", name: "a2ui", value: [
        {version: "v0.9", createSurface: {surfaceId: "ui-1", catalogId: "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json"}},
        {version: "v0.9", updateComponents: {surfaceId: "ui-1", components: [
          {id: "root", component: "Button", variant: "primary", child: "l", action: {event: {name: "publish"}}},
          {id: "l", component: "Text", text: "Publier"},
        ]}},
      ]},
      {type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId},
    ], [0, 900, 900, 0, 0]);
  }
  if (u.pathname === "/api/agent/artifacts/threads" && q.method === "GET") {
    return json(r, 200, {threads: [...threads.values()]});
  }
  const one = u.pathname.match(/^\/api\/agent\/artifacts\/threads\/([\w-]+)$/);
  if (one) {
    const t = threads.get(one[1]);
    if (!t) return json(r, 404, {detail: "Conversation introuvable."});
    if (q.method === "DELETE") {
      threads.delete(one[1]);
      r.writeHead(204, {"Access-Control-Allow-Origin": "*"});
      return r.end();
    }
    return json(r, 200, {
      ...t,
      entries: [
        {role: "user", text: "Une page de réservation"},
        {event: {type: "TOOL_CALL_START", toolCallId: "p", toolCallName: "preview_artifact"}},
        {event: {type: "TOOL_CALL_END", toolCallId: "p"}},
        {role: "assistant", id: "m1", text: "Voici une page de réservation."},
      ],
      preview: {document: doc},
      published: {slug: "reservation-orchestre", url: "https://artifacts.example/reservation-orchestre", version: 1},
    });
  }
  if (u.pathname === "/api/agent/settings") {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    return r.end(JSON.stringify({configured: settingsConfigured, serverKeyAvailable: false, provider: "anthropic", model: ""}));
  }
  if (u.pathname.startsWith("/api/")) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
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

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH});
const page = await (await browser.newContext({viewport: {width: 1280, height: 860}})).newPage();
const ev = (fn, arg) => page.evaluate(new Function("arg", deepJs + fn), arg);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/`);
await page.evaluate((port) => localStorage.setItem("artifacts-account", JSON.stringify({apiBaseUrl: `http://localhost:${port}`, token: "tok-smoke", user: {email: "smoke@example.org"}})), PORT);
await page.goto(`http://localhost:${PORT}/admin/atelier`);
await page.waitForTimeout(2000);

// Mise en page : pleine largeur, et le bas de l'atelier ne dépasse pas l'écran.
const layout = () => ev(`const a = document.querySelector("artifact-atelier-page"); const m = document.querySelector("main.shell-main"); const r = a.getBoundingClientRect(); const mr = m.getBoundingClientRect(); const root = (a.shadowRoot ?? a).querySelector("div").getBoundingClientRect(); return {w: Math.round(r.width), mainW: Math.round(mr.width), bottom: Math.round(r.bottom), mainBottom: Math.round(mr.bottom), rootBottom: Math.round(root.bottom), vh: innerHeight, docScroll: document.documentElement.scrollHeight, mainScroll: m.scrollHeight - m.clientHeight};`);
let l = await layout();
check("atelier en pleine largeur", l.w === l.mainW && l.w > 1100, JSON.stringify(l));
check("atelier : le bas ne dépasse pas l'écran", l.rootBottom <= l.mainBottom && l.mainBottom <= l.vh && l.docScroll <= l.vh && l.mainScroll <= 0, JSON.stringify(l));
await page.setViewportSize({width: 390, height: 700});
await page.waitForTimeout(300);
l = await layout();
check("mobile : pas de débordement de la page (l'atelier défile seul)", l.docScroll <= l.vh && l.mainScroll <= 0 && l.bottom <= l.vh, JSON.stringify(l));
await page.setViewportSize({width: 1280, height: 860});
await page.waitForTimeout(300);

const ta = await page.evaluateHandle(new Function(deepJs + `return all(document, "sonic-chat textarea")[0];`));
await ta.asElement().fill("Une page de réservation");
await ta.asElement().press("Enter");
// Pendant l'attente : un état visible tout de suite, puis l'outil en cours.
await page.waitForTimeout(300);
const st1 = await ev(`const s = all(document, "[data-chat-status]")[0]; return s ? {phase: s.getAttribute("data-phase"), text: s.textContent.trim()} : null;`);
check("loader dès l'envoi", !!st1 && /Envoi|Réflexion/.test(st1.text), JSON.stringify(st1));
await page.waitForTimeout(900);
const st2 = await ev(`const s = all(document, "[data-chat-status]")[0]; return s ? {phase: s.getAttribute("data-phase"), text: s.textContent.trim()} : null;`);
if (process.env.SHOT) console.log(await ev(`const s = all(document, "[data-chat-spinner]")[0]; if (!s) return "none"; const c = getComputedStyle(s); const r = s.getBoundingClientRect(); return [c.display, c.width, c.height, c.borderTopWidth, c.borderTopStyle, c.animationName, r.width].join(" ");`));
if (process.env.SHOT) await page.screenshot({path: process.env.SHOT, clip: {x: 0, y: 60, width: 460, height: 800}});
check("état précis : outil en cours", st2?.phase === "tool" && /Construction de l’aperçu/.test(st2.text), JSON.stringify(st2));
await page.waitForTimeout(2200);
const st3 = await ev(`return all(document, "[data-chat-status]").length;`);
check("loader retiré en fin de run", st3 === 0, String(st3));
const toolRow = await ev(`const t = all(document, "[data-chat-tool]")[0]; return t ? t.textContent.trim() : null;`);
check("ligne d'outil terminée", /Aperçu construit/.test(toolRow ?? ""), toolRow);

check("jeton envoyé à l'agent", runs[0]?.auth === "Bearer tok-smoke", runs[0]?.auth);
const msgs = await ev(`return all(document, "[data-chat-msg]").map((e) => e.getAttribute("data-chat-msg") + ":" + e.textContent);`);
check("messages affichés", msgs.includes("user:Une page de réservation") && msgs.includes("assistant:Voici une page de réservation."), msgs.join(" | "));
const title = await ev(`return all(document, 'artifact-viewer [data-sdui-node-id="title"]')[0]?.textContent ?? all(document, '[data-sdui-node-id="title"]')[0]?.textContent;`);
check("aperçu rendu par le viewer", title === "Orchestre d'harmonie", title);
await ev(`all(document, '[data-sdui-node-id="book"]')[0]?.click();`);
await page.waitForTimeout(400);
const count = await ev(`return all(document, '[data-sdui-node-id="count"]')[0]?.textContent;`);
check("aperçu jouable (store local)", count === "1", count);
await ev(`all(document, 'sonic-chat [data-sdui-node-id="root"]')[0]?.click();`);
await page.waitForTimeout(1200);
check("clic « Publier » renvoyé comme action A2UI", runs[1]?.input?.forwardedProps?.a2uiAction?.action?.name === "publish", JSON.stringify(runs[1]?.input?.forwardedProps?.a2uiAction ?? null));
check("kits proposés par défaut", runs[0]?.input?.forwardedProps?.atelier?.kits === true, JSON.stringify(runs[0]?.input?.forwardedProps?.atelier));
check("historique conservé", (runs[1]?.input?.messages ?? []).map((m) => m.role).join(",") === "user,assistant");
const msgs2 = await ev(`return all(document, "[data-chat-msg]").map((e) => e.textContent);`);
check("réponse après publication", msgs2.at(-1) === "Publié.", msgs2.join(" | "));
const pub = await ev(`const b = all(document, "[data-published]")[0]; return b ? {text: b.textContent.trim(), href: b.getAttribute("href")} : null;`);
check("lien vers l'artefact publié", pub?.href === "https://artifacts.example/reservation-orchestre" && /reservation-orchestre/.test(pub?.text ?? ""), JSON.stringify(pub));
const bannerOk = await ev(`return all(document, "[data-agent-not-configured]").length;`);
check("pas de bandeau quand l'assistant est configuré", bannerOk === 0);

// Case décochée : l'agent compose sans kit (mémorisé).
await ev(`const c = all(document, "[data-kits-toggle]")[0]; c.click();`);
await page.waitForTimeout(300);
const ta2 = await page.evaluateHandle(new Function(deepJs + `return all(document, "sonic-chat textarea")[0];`));
await ta2.asElement().fill("Sans kit cette fois");
await ta2.asElement().press("Enter");
await page.waitForTimeout(1500);
check("case « kits » décochée transmise à l'agent", runs.at(-1)?.input?.forwardedProps?.atelier?.kits === false, JSON.stringify(runs.at(-1)?.input?.forwardedProps?.atelier));
check("préférence mémorisée", (await page.evaluate(() => localStorage.getItem("artifacts-atelier-kits"))) === "0");

// Historique : liste, nouvelle conversation, reprise (journal, aperçu, publication), suite, suppression.
const threadId = runs[0].input.threadId;
await ev(`all(document, "[data-history-toggle]")[0].click();`);
await page.waitForTimeout(600);
const listed = await ev(`return all(document, "[data-thread]").map((e) => e.getAttribute("data-thread") + ":" + e.textContent.replace(/\\s+/g, " ").trim());`);
check("l'historique liste la conversation", listed.length === 1 && listed[0].startsWith(threadId) && listed[0].includes("Une page de réservation"), listed.join(" | "));
await ev(`all(document, "[data-new-thread]")[0].click();`);
await page.waitForTimeout(500);
const emptied = await ev(`return all(document, "sonic-chat [data-chat-msg]").length;`);
check("nouvelle conversation : chat vide", emptied === 0, String(emptied));
await ev(`all(document, "[data-history-toggle]")[0].click();`);
await page.waitForTimeout(400);
await ev(`all(document, "[data-thread] button")[0].click();`);
await page.waitForTimeout(1000);
const back = await ev(`return all(document, "sonic-chat [data-chat-msg]").map((e) => e.getAttribute("data-chat-msg") + ":" + e.textContent);`);
check("reprise : messages réaffichés", back.join("|") === "user:Une page de réservation|assistant:Voici une page de réservation.", back.join(" | "));
check("reprise : adresse ?thread=", new URL(page.url()).searchParams.get("thread") === threadId, page.url());
const backTitle = await ev(`return all(document, '[data-sdui-node-id="title"]')[0]?.textContent;`);
check("reprise : aperçu restauré", backTitle === "Orchestre d'harmonie", backTitle);
const backPub = await ev(`return all(document, "[data-published]")[0]?.getAttribute("href") ?? null;`);
check("reprise : publication restaurée", backPub === "https://artifacts.example/reservation-orchestre", String(backPub));
const ta3 = await page.evaluateHandle(new Function(deepJs + `return all(document, "sonic-chat textarea")[0];`));
await ta3.asElement().fill("Ajoute un tarif réduit");
await ta3.asElement().press("Enter");
await page.waitForTimeout(1500);
const resumed = runs.at(-1).input;
check("la suite part sur le même fil, avec l'historique", resumed.threadId === threadId && resumed.messages.map((m) => m.role + ":" + m.content).join("|") === "user:Une page de réservation|assistant:Voici une page de réservation.|user:Ajoute un tarif réduit", JSON.stringify(resumed.messages));
page.once("dialog", (d) => d.accept());
await ev(`all(document, "[data-history-toggle]")[0].click();`);
await page.waitForTimeout(500);
await ev(`all(document, "[data-thread] sonic-button")[1].click();`);
await page.waitForTimeout(800);
check("suppression : conversation retirée", threads.size === 0 && (await ev(`return all(document, "[data-thread]").length;`)) === 0, String(threads.size));

settingsConfigured = false;
await page.goto(`http://localhost:${PORT}/admin/atelier`);
await page.waitForTimeout(2000);
const banner = await ev(`const b = all(document, "[data-agent-not-configured]")[0]; return b ? {text: b.textContent, href: b.querySelector("a")?.href} : null;`);
check("bandeau « assistant non configuré » avec lien vers Tadaaa", !!banner && /connectivity\/assistant$/.test(banner.href ?? ""), JSON.stringify(banner));

check("aucune erreur JS", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
