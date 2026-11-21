/**
 * Smoke test du flux d'un run (`io.stream`) dans le viewer.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build (viewer et embed)
 * Lancer   : CHROME_PATH=…/chrome node scripts/smoke-stream.mjs
 *
 * Un faux Tadaaa (join, relecture `?after=`, sortie, progression, instantanés) et un faux hub
 * Mercure (SSE, événements `stream`) servent un viewer du run (`?rt=`), un spectateur en SSE
 * (`?wt=`) et un spectateur sans Mercure (relecture). Vérifie : entrée, actions, state.delta,
 * document.patch (état conservé), partition (piste interpolée + événement), trou de numérotation
 * rattrapé, spectateur arrivé en cours (instantané + document patché), spectateur intégré
 * (embed.js `data-watch-token`, build embed requis), télécommande (`io.stream.emit` d'un autre
 * artefact relayée comme par un lien Tadaaa), progression, fin du flux
 * (sortie publiée par le viewer du run, bandeau chez les spectateurs).
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {build} from "esbuild";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const SLUG = "flux";
const RUN = "0190f3a2-2222-7222-8333-944455556666";
const RUN2 = "0190f3a2-3333-7222-8333-944455556666";
let pairClaims = 0;
const pairRequests = [];
const pairRoles = [];
let doc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/stream.json"), "utf8"));
// Télécommande (io.stream.emit) reliée au run du flux, comme un lien Tadaaa (link_artifact_runs).
const REMOTE_RUN = "0190f3a2-3333-7333-8444-955566667777";
const remoteDoc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/remote.json"), "utf8"));
const emitted = [];
/** map du lien : pad → message du flux cible. */
const linkMap = (item) => item.data?.pad === "pulse"
  ? [{type: "action", name: "pulse"}]
  : item.data?.pad === "titre" ? [{type: "document.patch", patch: [{op: "replace", path: "/views/0/root/nodes/0/textContent", value: "Télécommandé"}]}] : [];

// Même JSON Patch que le viewer, pour tenir le document courant côté faux serveur.
const out = await build({entryPoints: [path.join(ROOT, "src/app/json-patch.ts")], bundle: true, format: "esm", write: false, platform: "node"});
const {applyPatch} = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));

const log = [];
let seq = 0;
let patched = null;
let score = null;
let snapshot = null;
let ended = false;
let status = "pending";
const outputs = [];
const outs = [];
const joins = [];
const sse = new Set();

/** Émetteur : numérote, journalise, relaie (sauf `lost` : message perdu par le hub). */
function emit(messages, {lost = false} = {}) {
  const now = Date.now();
  const batch = messages.map((m) => ({...m, seq: ++seq, t: now}));
  for (const m of batch) {
    log.push(m);
    if (m.type === "document.patch") patched = applyPatch(patched ?? doc, m.patch);
    if (m.type === "score") score = {score: m.score, t: now, seq: m.seq};
    if (m.type === "score.stop") score = null;
    if (m.type === "end") ended = true;
  }
  if (!lost) for (const res of sse) res.write(`id: ${RUN}:${seq}\nevent: stream\ndata: ${JSON.stringify({events: batch})}\n\n`);
}

function join(u) {
  const token = u.searchParams.get("rt") || u.searchParams.get("wt");
  const role = u.searchParams.get("rt") ? "performer" : "watcher";
  const after = u.searchParams.has("after") ? Number(u.searchParams.get("after")) : -1;
  joins.push({role, token, after});
  const from = after >= 0 ? after : (snapshot?.seq ?? 0);
  const events = log.filter((m) => m.seq > from && (after >= 0 || ["action", "state.snapshot", "state.delta"].includes(m.type)));
  const body = {runId: RUN, role, status, version: 1, store: "scene", seq, ended, serverTime: Date.now(), events, complete: true,
    stream: {actions: {pulse: {}, palette: {}}, state: true, document: true, score: true, rate: 60, progress: true}};
  if (after < 0) Object.assign(body, {snapshot, score, input: {start: 5}, watchUrl: `https://artifacts.example/${SLUG}?run=${RUN}&wt=wtok`, ...(patched ? {document: patched} : {})});
  // `poll` : spectateur sans Mercure (suivi par relecture).
  if (status === "pending" && token !== "poll") {
    body.mercure = {hubUrl: `http://localhost:${PORT}/hub`, token: "jwt", topics: {in: `https://tadaaa.app/runs/${RUN}/k/in`, out: `https://tadaaa.app/runs/${RUN}/k/out`}, expiresIn: 3600};
  }
  return body;
}

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  const cors = {"Access-Control-Allow-Origin": "*"};
  const json = (code, body) => { r.writeHead(code, {"Content-Type": "application/json", ...cors}); r.end(JSON.stringify(body)); };
  const read = (cb) => { let b = ""; q.on("data", (c) => (b += c)); q.on("end", () => cb(JSON.parse(b || "null"))); };
  if (q.method === "OPTIONS") {
    r.writeHead(204, {...cors, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type"});
    return r.end();
  }
  if (u.pathname === "/hub") {
    if (u.searchParams.get("authorization") !== "jwt" || !u.searchParams.get("topic")?.endsWith("/in")) return json(401, {});
    r.writeHead(200, {"Content-Type": "text/event-stream", "Cache-Control": "no-cache", ...cors});
    r.write(": ok\n\n");
    sse.add(r);
    q.on("close", () => sse.delete(r));
    return;
  }
  const rm = /^\/api\/public\/artifacts\/remote\/runs\/([0-9a-f-]{36})(\/stream|\/output)?$/.exec(u.pathname);
  if (rm) {
    if (rm[2] === "/stream" && q.method === "GET") {
      return json(200, {runId: REMOTE_RUN, role: "performer", status: "pending", seq: 0, ended: false, serverTime: Date.now(), events: [], complete: true, stream: {emit: true}, snapshot: null, score: null, input: {}, mercure: null});
    }
    if (rm[2] === "/stream" && q.method === "POST") return read((b) => {
      if (b.rt !== "rtok") return json(404, {});
      for (const e of b.events) {
        if (e.type !== "emit") continue;
        if (emitted.some((x) => x.id === e.id)) continue;
        emitted.push(e);
        const msgs = e.op ? [] : linkMap(e);
        if (msgs.length) emit(msgs);
      }
      json(200, {ok: true});
    });
    return json(200, {runId: REMOTE_RUN, slug: "remote", mode: "interactive", status: "pending", input: {}});
  }
  if (u.pathname.startsWith("/api/public/artifacts/remote")) {
    if (u.pathname.includes("/collections/")) return json(200, {member: []});
    return json(200, {id: "remote", slug: "remote", title: remoteDoc.title, description: "", visibility: "public", document: remoteDoc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false});
  }
  const pm = /^\/api\/public\/artifacts\/flux\/pair\/([A-Za-z0-9]+)$/.exec(u.pathname);
  if (pm && q.method === "POST") {
    if (pm[1] !== "ABCDEFGH") return json(404, {detail: "Code inconnu."});
    pairClaims++;
    return json(201, {runId: RUN2, runToken: "tok2", slug: SLUG});
  }
  const m = /^\/api\/public\/artifacts\/flux\/runs\/([0-9a-f-]{36})(\/stream|\/output|\/pair)?$/.exec(u.pathname);
  if (m) {
    if (m[2] === "/pair") return read((b) => {
      pairRequests.push(b.rt);
      pairRoles.push(b.role ?? null);
      const code = b.role === "b" ? "BBBBBBBB" : "ABCDEFGH";
      json(200, {role: b.role ?? null, code, url: `http://localhost:${PORT}/${SLUG}?pair=${code}`, expiresAt: new Date(Date.now() + 9e5).toISOString(), remaining: 4 - pairClaims, max: 4, paired: pairClaims, remote: SLUG, locked: false});
    });
    if (m[2] === "/stream" && q.method === "GET") return json(200, join(u));
    if (m[2] === "/stream" && q.method === "POST") return read((b) => {
      for (const e of b.events) {
        outs.push(e);
        if (e.type === "snapshot") snapshot = {seq: e.seq, state: e.state};
      }
      json(200, {ok: true, seq});
    });
    if (m[2] === "/output") return read((b) => { outputs.push(b); status = "completed"; json(200, {status}); });
    return json(200, {runId: RUN, slug: SLUG, mode: "interactive", status, input: {start: 5}});
  }
  if (u.pathname === "/hote.html") {
    r.writeHead(200, {"Content-Type": "text/html"});
    return r.end(`<!doctype html><meta charset="utf-8"><body><h1>Hôte</h1>
<script src="/embed.js" data-artifact="${SLUG}" data-run="${RUN}" data-watch-token="wtok" async></script></body>`);
  }
  if (u.pathname.startsWith(`/api/public/artifacts/${SLUG}`)) {
    if (u.pathname.includes("/collections/")) return json(200, {member: []});
    return json(200, {id: SLUG, slug: SLUG, title: doc.title, description: "", visibility: "public", document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false});
  }
  let f = path.join(DIST, u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  const t = f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".svg") ? "image/svg+xml" : "text/html";
  r.writeHead(200, {"Content-Type": t});
  r.end(fs.readFileSync(f));
}).listen(PORT);

let failures = 0;
const check = (label, ok, detail = "") => { console.log(`${ok ? "✔" : "✘"} ${label}${detail ? "  — " + detail : ""}`); if (!ok) failures++; };
const read = (p) => p.evaluate(() => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  const text = (s) => { const e = deep(document, s)[0]; return e ? (e.shadowRoot?.textContent || e.textContent || "").trim() : null; };
  const status = deep(document, ".artifact-io-status")[0];
  return {count: text("#count"), hue: text("#hue"), label: text("#label"), titre: text("#titre"), status: status?.textContent.trim() ?? "", stream: deep(document, "artifact-viewer")[0]?.dataset.stream ?? ""};
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (p, pred, ms = 4000) => { const end = Date.now() + ms; let s; while (Date.now() < end) { s = await read(p); if (pred(s)) return s; await wait(100); } return s ?? read(p); };

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"]});
const errors = [];
const open = async (qs) => {
  const p = await browser.newPage({viewport: {width: 800, height: 600}});
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`http://localhost:${PORT}/${SLUG}?${qs}`);
  return p;
};

const performer = await open(`run=${RUN}&rt=tok`);
const watcher = await open(`run=${RUN}&wt=wtok`);
const poller = await open(`run=${RUN}&wt=poll`);
const all = [["viewer du run", performer], ["spectateur SSE", watcher], ["spectateur relecture", poller]];
for (const [name, p] of all) {
  const s = await until(p, (s) => s.count === "5");
  check(`${name} : entrée du run appliquée (count 5)`, s.count === "5", JSON.stringify(s));
}
for (const [name, p] of [["viewer du run", performer], ["spectateur SSE", watcher]]) {
  const r = await p.evaluate(() => {
    const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
    const qr = deep(document, "sonic-qr")[0];
    const svg = qr?.shadowRoot?.querySelector("svg");
    const role = deep(document, "#role")[0];
    return {label: svg?.getAttribute("aria-label") ?? null, path: svg?.querySelector("path")?.getAttribute("d")?.length ?? 0, role: (role?.shadowRoot?.textContent || role?.textContent || "").trim()};
  });
  check(`${name} : artifactRun.watchUrl en QR code, rôle publié`, !!r.label?.includes("wt=wtok") && r.path > 100 && r.role === (p === performer ? "performer" : "watcher"), JSON.stringify(r));
}
{
  const r = await performer.evaluate(() => {
    const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
    return deep(document, "#qrpair")[0]?.shadowRoot?.querySelector("svg")?.getAttribute("aria-label") ?? null;
  });
  check("hôte : code d'appairage demandé avec le jeton du run, QR affiché", pairRequests.includes("tok") && !!r?.includes("pair=ABCDEFGH"), String(r));
  const rb = await performer.evaluate(() => {
    const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
    return deep(document, "#qrpairb")[0]?.shadowRoot?.querySelector("svg")?.getAttribute("aria-label") ?? null;
  });
  check("rôles : un code par rôle (artifactRun.pairs.b)", pairRoles.includes("a") && pairRoles.includes("b") && !!rb?.includes("pair=BBBBBBBB"), JSON.stringify({rb, pairRoles: pairRoles.slice(0, 4)}));
  const w = await watcher.evaluate(() => {
    const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
    return deep(document, "#qrpair")[0]?.shadowRoot?.querySelector("svg") ? "qr" : "vide";
  });
  check("spectateur : pas de code d'appairage", w === "vide", w);
}
check("transports", (await read(watcher)).stream === "mercure" && (await read(poller)).stream === "polling", `${(await read(watcher)).stream} / ${(await read(poller)).stream}`);

console.log("\n== actions, état, document");
emit([{type: "action", name: "pulse"}, {type: "action", name: "pulse"}, {type: "action", name: "pulse"}]);
for (const [name, p] of all) check(`${name} : 3 actions (count 8)`, (await until(p, (s) => s.count === "8")).count === "8");
emit([{type: "state.delta", patch: [{op: "replace", path: "/label", value: "bonjour"}]}]);
for (const [name, p] of all) check(`${name} : state.delta`, (await until(p, (s) => s.label === "bonjour")).label === "bonjour");
emit([{type: "document.patch", patch: [{op: "replace", path: "/views/0/root/nodes/0/textContent", value: "Après"}]}]);
for (const [name, p] of all) {
  const s = await until(p, (s) => s.titre === "Après");
  check(`${name} : document.patch, état conservé`, s.titre === "Après" && s.count === "8" && s.label === "bonjour", JSON.stringify(s));
}

console.log("\n== partition");
emit([{type: "score", score: {duration: 1000, tracks: [{path: "/hue", keys: [{at: 0, value: 0}, {at: 1000, value: 1}]}], events: [{at: 500, action: "pulse"}]}}]);
await wait(400);
const mid = await read(watcher);
check("piste interpolée en cours de route", Number(mid.hue) > 0 && Number(mid.hue) < 1, mid.hue);
for (const [name, p] of all) {
  const s = await until(p, (s) => s.hue === "1" && s.count === "9");
  check(`${name} : piste au bout (hue 1) et événement (count 9)`, s.hue === "1" && s.count === "9", JSON.stringify(s));
}

console.log("\n== trou de numérotation");
emit([{type: "action", name: "pulse"}], {lost: true});
emit([{type: "action", name: "pulse"}]);
for (const [name, p] of all) check(`${name} : message perdu rattrapé (count 11)`, (await until(p, (s) => s.count === "11")).count === "11");
check("rattrapage par ?after", joins.some((j) => j.after > 0), JSON.stringify(joins.filter((j) => j.after > 0).slice(0, 3)));

console.log("\n== spectateur arrivé en cours");
await wait(5500);
check("instantané publié par le viewer du run", snapshot?.state?.count === 11 && snapshot.seq === seq, JSON.stringify(snapshot));
check("progression publiée", outs.some((e) => e.type === "progress" && e.value === 11), JSON.stringify(outs.filter((e) => e.type === "progress").slice(-2)));
const late = await open(`run=${RUN}&wt=wtok`);
{
  const s = await until(late, (s) => s.count === "11" && s.titre === "Après");
  check("état, document patché et piste rattrapés", s.count === "11" && s.titre === "Après" && s.label === "bonjour" && s.hue === "1", JSON.stringify(s));
}
emit([{type: "action", name: "pulse"}]);
check("puis suit le direct (count 12)", (await until(late, (s) => s.count === "12")).count === "12");

console.log("\n== spectateur intégré (embed.js, data-watch-token)");
const host = await browser.newPage({viewport: {width: 800, height: 600}});
host.on("pageerror", (e) => errors.push(String(e)));
await host.goto(`http://localhost:${PORT}/hote.html`);
{
  const s = await until(host, (s) => s.count === "12" && s.titre === "Après", 8000);
  check("état et document du direct dans l'intégration", s.count === "12" && s.titre === "Après", JSON.stringify(s));
}
emit([{type: "action", name: "pulse"}]);
check("intégration : suit le direct (count 13)", (await until(host, (s) => s.count === "13")).count === "13");

console.log("\n== télécommande (file d'envoi d'un autre artefact, lien entre runs)");
{
  const remote = await browser.newPage({viewport: {width: 600, height: 400}});
  remote.on("pageerror", (e) => errors.push(String(e)));
  await remote.goto(`http://localhost:${PORT}/remote?run=${REMOTE_RUN}&rt=rtok`);
  const readRemote = () => remote.evaluate(() => {
    const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
    const t = (s) => { const e = deep(document, s)[0]; return e ? (e.shadowRoot?.textContent || e.textContent || "").trim() : null; };
    return {n: t("#n"), sent: t("#sent")};
  });
  for (let i = 0; i < 40 && (await readRemote()).sent !== "0"; i++) await wait(100);
  const before = Number((await read(watcher)).count);
  await remote.locator("#pulse").click();
  await remote.locator("#pulse").click();
  await remote.locator("#titre").click();
  for (let i = 0; i < 40 && (await readRemote()).sent !== "3"; i++) await wait(100);
  const r = await readRemote();
  check("télécommande : 3 éléments publiés et acquittés (emit:ok)", r.n === "3" && r.sent === "3" && emitted.length === 3, JSON.stringify({...r, emitted: emitted.map((e) => e.id)}));
  check("éléments publiés une fois chacun, dans l'ordre", JSON.stringify(emitted.map((e) => e.data.pad)) === JSON.stringify(["pulse", "pulse", "titre"]));
  // Envoi ciblé et commandes d'appairage dans la même file.
  await remote.locator("#cible").click();
  await remote.locator("#retirer").click();
  await remote.locator("#fermer").click();
  for (let i = 0; i < 40 && (await readRemote()).sent !== "6"; i++) await wait(100);
  const [cible, retirer, fermer] = emitted.slice(3);
  check("élément ciblé publié avec to", cible?.to === RUN && cible?.data?.pad === "pulse", JSON.stringify(cible));
  check("commande kick publiée sans data", retirer?.op === "kick" && retirer?.runId === "0190f3a2-4444-7222-8333-944455556666" && !("data" in retirer), JSON.stringify(retirer));
  check("commande lock publiée", fermer?.op === "lock" && !("data" in fermer) && !("to" in fermer), JSON.stringify(fermer));
  for (const [name, p] of [["viewer du run", performer], ["spectateur", watcher], ["intégration", host]]) {
    const s = await until(p, (s) => Number(s.count) === before + 3 && s.titre === "Télécommandé");
    check(`${name} : piloté par la télécommande`, Number(s.count) === before + 3 && s.titre === "Télécommandé", JSON.stringify(s));
  }
  await remote.close();
}

console.log("\n== présence");
check("viewer du run : signe de vie envoyé", outs.some((e) => e.type === "alive"), String(outs.filter((e) => e.type === "alive").length));
emit([{type: "presence", count: 2, members: [{runId: "a", slug: "ecran", index: 1, since: 0, seen: 0}, {runId: "b", slug: "ecran", index: 2, since: 0, seen: 0}]}]);
for (const [name, p] of [["viewer du run", performer], ["spectateur SSE", watcher], ["spectateur relecture", poller]]) {
  const r = await until(p, () => false, 1500).then(() => p.evaluate(() => {
    const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
    const e = deep(document, "#presence")[0];
    return (e?.shadowRoot?.textContent || e?.textContent || "").trim();
  }));
  check(`${name} : artifactRun.presence.count = 2`, r === "2", r);
}

console.log("\n== appairage");
{
  const phone = await open(`pair=ABCDEFGH`);
  await until(phone, (s) => s.count !== null);
  const url = phone.url();
  check("lien d'appairage : place réclamée, adresse passée en run + jeton", pairClaims === 1 && url.includes(`run=${RUN2}`) && url.includes("rt=tok2") && !url.includes("pair="), url);
  const bad = await open(`pair=ZZZZZZZZ`);
  const s = await until(bad, (s) => s.status.includes("Appairage"));
  check("code inconnu : bandeau d'erreur", s.status.includes("Appairage impossible") && s.status.includes("Code inconnu"), s.status);
  await phone.close();
  await bad.close();
}

console.log("\n== fin du flux");
emit([{type: "end"}]);
await until(performer, () => outputs.length > 0);
check("sortie publiée par le viewer du run à la fin (16)", outputs.length === 1 && outputs[0].output === 16 && outputs[0].rt === "tok", JSON.stringify(outputs));
for (const [name, p] of [["spectateur SSE", watcher], ["spectateur arrivé en cours", late], ["intégration", host]]) {
  const s = await until(p, (s) => s.status.includes("terminé"));
  check(`${name} : bandeau de fin`, s.status.includes("terminé"), s.status);
}
await performer.close({runBeforeUnload: true});
await wait(800);
check("viewer du run fermé : départ annoncé (bye)", outs.some((e) => e.type === "bye"), String(outs.filter((e) => e.type === "bye").length));
check("aucune sortie publiée par un spectateur", outputs.every((o) => o.rt === "tok"));
check("aucune erreur JS", errors.length === 0, errors.join(" | ").slice(0, 400));

await browser.close();
server.close();
for (const res of sse) res.end();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
