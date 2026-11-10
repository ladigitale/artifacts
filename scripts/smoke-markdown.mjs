/**
 * Smoke test de `sonic-markdown` (creative-stack, addon markdown) dans le viewer, sous la CSP de prod.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-markdown.mjs
 *
 * Le réseau jsDelivr est simulé : Prism et KaTeX sont servis depuis les paquets npm installés dans MD_PKG
 * (défaut /tmp/md-pkg : `npm i --prefix /tmp/md-pkg prismjs@1.30.0 katex@0.19.1`) ; l'empreinte d'intégrité
 * épinglée dans l'addon est donc vérifiée par le navigateur.
 *
 * Vérifie : rendu GFM, HTML et liens dangereux inertes, coloration et formules chargées à la demande, prompt à
 * variables lu depuis un DataProvider du document, sortie DataProvider, rendu en flux, aucune erreur JS / CSP.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/markdown.json"), "utf8"));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; media-src 'self' https: blob: data:; connect-src 'self' https: blob:; worker-src 'self' blob: https://cdn.jsdelivr.net; child-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  if (/^\/api\/public\/artifacts\/([^/]+)/.test(u.pathname)) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    return r.end(JSON.stringify({id: "markdown", slug: "markdown", title: doc.title, description: "", visibility: "link", document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
  }
  let f = path.join(DIST, u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  const t = f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".svg") ? "image/svg+xml" : "text/html";
  r.writeHead(200, {"Content-Type": t, "Content-Security-Policy": CSP});
  r.end(fs.readFileSync(f));
}).listen(PORT);

let failures = 0;
const check = (label, ok, detail = "") => { console.log(`${ok ? "✔" : "✘"} ${label}${detail ? "  — " + detail : ""}`); if (!ok) failures++; };

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"]});
const errors = [];
const page = await (await browser.newContext({viewport: {width: 900, height: 1400}})).newPage();
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused|integrity|sonic-/i.test(m.text())) errors.push(m.text()); });
page.on("dialog", (d) => { errors.push(`dialogue ouvert : ${d.message()}`); d.dismiss(); });

const PKG = process.env.MD_PKG ?? "/tmp/md-pkg";
const MAP = [
  [/^\/npm\/prismjs@1\.30\.0\/(.+)$/, "node_modules/prismjs/$1"],
  [/^\/npm\/katex@0\.19\.1\/(.+)$/, "node_modules/katex/$1"],
];
const served = [];
await page.route("https://cdn.jsdelivr.net/**", (route) => {
  const u = new URL(route.request().url());
  for (const [re, to] of MAP) {
    const m = re.exec(u.pathname);
    if (!m) continue;
    const f = path.join(PKG, to.replace("$1", m[1]));
    if (!f.startsWith(PKG) || !fs.existsSync(f)) break;
    served.push(u.pathname);
    return route.fulfill({status: 200, body: fs.readFileSync(f), headers: {"Content-Type": "text/javascript", "Access-Control-Allow-Origin": "*"}});
  }
  return route.fulfill({status: 404, body: "absent"});
});

/** Élément `sonic-markdown` par id (à travers les shadow roots) : état et fragments de son rendu. */
const probe = (id) => page.evaluate((id) => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.id === id && e.tagName === "SONIC-MARKDOWN") a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  const el = deep(document)[0];
  if (!el) return null;
  const root = el.shadowRoot?.querySelector(".root");
  const q = (s) => [...(root?.querySelectorAll(s) ?? [])];
  return {
    state: JSON.parse(JSON.stringify(el.getState())),
    h1: q("h1").map((h) => [h.id, h.textContent]),
    strong: q("strong").map((n) => n.textContent),
    tasks: q("li.task input").map((i) => i.checked),
    th: q("th").map((t) => t.getAttribute("style")),
    keyword: q("pre span.token.keyword").map((n) => n.textContent),
    math: q("math").length,
    scripts: q("script").length,
    hrefs: q("a").map((a) => a.getAttribute("href")),
    text: root?.textContent ?? "",
    vars: q(".var").map((v) => [v.textContent, v.classList.contains("missing")]),
    toc: q("nav.toc a").length,
    blocks: root ? root.children.length : 0,
  };
}, id);

await page.goto(`http://localhost:${PORT}/markdown?k=tok`);
await page.waitForFunction(() => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.tagName === "SONIC-MARKDOWN") a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  const els = deep(document);
  const doc = els.find((e) => e.id === "doc");
  return els.length === 3 && doc?.shadowRoot?.querySelector("math") && doc.shadowRoot.querySelector("span.token");
}, null, {timeout: 30000}).catch(() => {});

const d = await probe("doc");
check("3 composants rendus, addon chargé à la demande", !!d, "");
check("titre avec id et plan publié", d?.h1?.[0]?.[0] === "doc-guide-rapide" && d.state.toc.length === 2 && d.state.title === "Guide rapide", JSON.stringify(d?.state?.toc));
check("GFM : gras, tâches, alignement des colonnes", d?.strong?.[0] === "gras" && JSON.stringify(d.tasks) === "[true,false]" && d.th[1] === "text-align:right", JSON.stringify([d?.tasks, d?.th]));
check("HTML brut affiché comme texte, lien javascript: neutralisé", d?.scripts === 0 && d.text.includes("<script>alert(1)</script>") && !d.hrefs.some((h) => /^javascript:/i.test(h ?? "")), JSON.stringify(d?.hrefs));
check("coloration Prism (tokens → DOM)", d?.keyword?.includes("const"), JSON.stringify(d?.keyword));
check("formule KaTeX en MathML", d?.math === 1, String(d?.math));
check("sommaire rendu (feature toc)", d?.toc === 2, String(d?.toc));
check("Prism et KaTeX servis par jsDelivr épinglé, avec empreinte", served.some((p) => p.endsWith("/components/prism-core.min.js")) && served.some((p) => p.endsWith("/components/prism-typescript.min.js")) && served.some((p) => p.endsWith("/dist/katex.min.js")), served.join(", "));
check("sortie DP : bloc de code et lien", d?.state.code?.[0]?.lang === "ts" && d.state.links.some((l) => l.href === "https://concorde.supersoniks.org"), JSON.stringify(d?.state?.code));

const p = await probe("prompt");
check("prompt lu depuis un DataProvider du document", p?.state.status === "ready" && p.state.source === "source", JSON.stringify(p?.state?.status));
check("variables : valeur, défaut, manquante", JSON.stringify(p?.vars) === JSON.stringify([["français", false], ["neutre", false], ["texte", true]]), JSON.stringify(p?.vars));
check("prompt résolu et variables manquantes publiés", p?.state.resolved.startsWith("Réponds en français, sur un ton neutre.") && JSON.stringify(p.state.missingVars) === '["texte"]', JSON.stringify(p?.state?.missingVars));

// Flux : le texte cumulé arrive par morceaux dans un DataProvider.
const TEXT = "# Réponse\n\nPremier paragraphe.\n\n- un\n- deux\n\n```js\nconsole.log(1)\n```\n\nFin **en gras**.";
const canSet = await page.evaluate(() => typeof window.SonicPublisherManager?.get === "function");
check("DataProviders accessibles pour simuler le flux", canSet);
if (canSet) {
  for (let i = 4; i <= TEXT.length + 4; i += 4) {
    await page.evaluate(([text, done]) => window.SonicPublisherManager.get("flux").set({answer: {text, done}}), [TEXT.slice(0, i), false]);
    await page.waitForTimeout(16);
  }
  const mid = await probe("flux");
  check("flux en cours : status streaming", mid?.state.status === "streaming", mid?.state?.status);
  await page.evaluate((text) => window.SonicPublisherManager.get("flux").set({answer: {text, done: true}}), TEXT);
  await page.waitForTimeout(200);
  const end = await probe("flux");
  check("flux terminé : ready, rendu complet", end?.state.status === "ready" && end.strong[0] === "en gras" && end.h1[0]?.[1] === "Réponse" && end.state.code[0]?.text === "console.log(1)", JSON.stringify([end?.state?.status, end?.strong]));
}

check("aucune erreur JS / CSP / intégrité", errors.length === 0, errors.join(" | ").slice(0, 400));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
