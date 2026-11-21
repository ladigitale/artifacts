/**
 * Smoke test des champs de classe (Vite 8 / Oxc).
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : CHROME_PATH=…/chrome node scripts/smoke-class-fields.mjs
 *
 * Lit et Concorde posent les accesseurs réactifs sur le prototype (décorateurs legacy,
 * `static properties`, `@bind`). Un champ de classe compilé en [[Define]] devient une propriété
 * d'instance qui masque l'accesseur : plus de rendu, plus d'écriture dans le DataProvider, sans
 * erreur. Le garde-fou de build de Concorde ne compare qu'une classe à ses propres décorateurs :
 * il ne voit ni une propriété redéclarée dans une sous-classe ni `static properties`.
 *
 * Vérifie, sur le bundle servi (viewer puis intégration préfixée `afx`), qu'aucun custom element
 * des fixtures n'a de propriété d'instance qui masque un accesseur de son prototype, et qu'une
 * propriété écrite après coup est bien reflétée (le composant réagit).
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const FIXTURES = path.join(ROOT, "tests/fixtures");
const PORT = 4455;
const docs = Object.fromEntries(
  fs.readdirSync(FIXTURES).filter((f) => f.endsWith(".json")).map((f) => [f.replace(/\.json$/, ""), JSON.parse(fs.readFileSync(path.join(FIXTURES, f), "utf8"))]),
);

const TYPES = {".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".wasm": "application/wasm"};
const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  const m = /^\/api\/public\/artifacts\/([^/]+)/.exec(u.pathname);
  if (m) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    const doc = docs[m[1]];
    if (!doc) return r.end("{}");
    return r.end(JSON.stringify({id: m[1], slug: m[1], title: doc.title ?? m[1], description: "", visibility: "link", document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], assets: []}));
  }
  if (u.pathname === "/embed-host") {
    r.writeHead(200, {"Content-Type": "text/html"});
    return r.end(`<!doctype html><meta charset="utf-8"><body>${["nav", "plot"].map((s) => `<script src="/embed.js" data-artifact="${s}" data-key="tok" data-api="http://localhost:${PORT}" data-height="400"></script>`).join("")}</body>`);
  }
  let f = path.join(DIST, u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  r.writeHead(200, {"Content-Type": TYPES[path.extname(f)] ?? "text/html", "Access-Control-Allow-Origin": "*"});
  r.end(fs.readFileSync(f));
}).listen(PORT);

let failures = 0;
const check = (label, ok, detail = "") => { console.log(`${ok ? "✔" : "✘"} ${label}${detail ? "  — " + detail : ""}`); if (!ok) failures++; };

/** Custom elements de la page (shadow roots compris) : balises vues et accesseurs masqués. */
const scan = () => {
  const tags = new Set();
  const shadowed = {};
  let undefinedTags = 0;
  const visit = (root) => root.querySelectorAll("*").forEach((el) => {
    if (el.localName.includes("-")) {
      if (!customElements.get(el.localName)) undefinedTags++;
      else {
        tags.add(el.localName);
        const hidden = Object.keys(el).filter((key) => {
          for (let p = Object.getPrototypeOf(el); p; p = Object.getPrototypeOf(p)) {
            const d = Object.getOwnPropertyDescriptor(p, key);
            if (d) return Boolean(d.get || d.set);
          }
          return false;
        });
        if (hidden.length) shadowed[el.localName] = hidden;
      }
    }
    if (el.shadowRoot) visit(el.shadowRoot);
  });
  visit(document);
  return {tags: [...tags], shadowed};
};

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]});
const seen = new Set();
const problems = [];
const skipped = [];
const within = (promise, ms) => Promise.race([promise, new Promise((_, no) => setTimeout(() => no(new Error("délai dépassé")), ms))]);
for (const slug of Object.keys(docs)) {
  // Un contexte par fixture : une page qui plante (WebGL, WASM sans GPU) n'emporte pas les autres.
  const ctx = await browser.newContext({viewport: {width: 900, height: 600}});
  const page = await ctx.newPage();
  try {
    await within(page.goto(`http://localhost:${PORT}/${slug}?k=tok`, {waitUntil: "domcontentloaded"}), 15000);
    await page.waitForTimeout(1200);
    const res = await within(page.evaluate(scan), 8000);
    res.tags.forEach((t) => seen.add(t));
    for (const [tag, keys] of Object.entries(res.shadowed)) problems.push(`${slug} <${tag}> : ${keys.join(", ")}`);
  } catch (e) {
    skipped.push(slug);
  }
  await within(ctx.close(), 5000).catch(() => {});
}
if (skipped.length) console.log(`  (fixtures non scannées, page plantée ou trop lente : ${skipped.join(", ")})`);
check("viewer : la plupart des fixtures sont scannées", skipped.length <= Object.keys(docs).length / 4, `${skipped.length} sur ${Object.keys(docs).length}`);
check(`viewer : ${seen.size} custom elements distincts scannés`, seen.size >= 60, String(seen.size));
check("viewer : aucun champ ne masque un accesseur réactif", problems.length === 0, problems.slice(0, 8).join(" | "));

// Réactivité réelle : une propriété écrite après coup passe par l'accesseur et se reflète.
const page = await browser.newPage({viewport: {width: 900, height: 600}});
await page.goto(`http://localhost:${PORT}/nav?k=tok`);
await page.waitForTimeout(1500);
const reactive = await page.evaluate(async () => {
  const b = document.createElement("sonic-button");
  document.body.appendChild(b);
  await b.updateComplete;
  b.variant = "outline";
  b.size = "lg";
  await b.updateComplete;
  const out = {variant: b.getAttribute("variant"), size: b.getAttribute("size")};
  b.remove();
  return out;
});
check("sonic-button : variant et size écrits après coup sont reflétés", reactive.variant === "outline" && reactive.size === "lg", JSON.stringify(reactive));

// Intégration (bundle préfixé afx)
if (fs.existsSync(path.join(DIST, "embed/artifact-embed.js"))) {
  await page.goto(`http://localhost:${PORT}/embed-host`);
  await page.waitForTimeout(4000);
  const res = await page.evaluate(scan);
  const afx = res.tags.filter((t) => t.startsWith("afx-"));
  check(`intégration : ${afx.length} composants afx-* scannés`, afx.length >= 5, afx.slice(0, 12).join(" "));
  check("intégration : aucun champ ne masque un accesseur réactif", Object.keys(res.shadowed).length === 0, JSON.stringify(res.shadowed).slice(0, 400));
} else {
  console.log("  (dist/embed absent : intégration non vérifiée, lancer yarn build:embed)");
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
