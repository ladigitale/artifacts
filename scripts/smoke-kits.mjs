/**
 * Smoke test des kits Tadaaa (config/artifacts/kits côté API) : chaque document
 * produit par un kit est chargé dans le vrai viewer et joué (clics souris, clavier,
 * horloge, shader, collecte).
 *
 * Prérequis :
 *   VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer :
 *   CHROME_PATH=… node scripts/smoke-kits.mjs [quiz snake plasma onepage survey]
 *
 * Documents : tests/fixtures/kit-<nom>.json (générés par ArtifactKits avec
 * tests/Fixtures/kits/*.json de Tadaaa). Scénarios : scripts/kits/<nom>.mjs.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const names = process.argv.slice(2).length ? process.argv.slice(2) : ["quiz", "snake", "plasma", "onepage", "survey"];

let doc = null;
const posts = [];
const server = http.createServer(async (q, r) => {
  const u = new URL(q.url, "http://x");
  if (q.method === "POST") {
    let b = "";
    for await (const c of q) b += c;
    posts.push({path: u.pathname, body: b ? JSON.parse(b) : null});
  }
  if (u.pathname.startsWith("/api/public/artifacts/")) {
    r.writeHead(200, {"Content-Type": "application/json"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    return r.end(JSON.stringify({id: "x", slug: "kit", title: doc.title, description: "", visibility: "public", document: doc,
      scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
  }
  let f = path.join(DIST, u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  const t = f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".svg") ? "image/svg+xml" : f.endsWith(".wasm") ? "application/wasm" : "text/html";
  r.writeHead(200, {"Content-Type": t});
  r.end(fs.readFileSync(f));
}).listen(PORT);

const deep = `const all = (sel, r = document, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(sel)) a.push(e); if (e.shadowRoot) all(sel, e.shadowRoot, a); }); return a; };
const txt = (n) => { if (n.nodeType === 3) return n.textContent; if (n.nodeType !== 1 && n.nodeType !== 11) return ""; if (n.tagName === "STYLE" || n.tagName === "SCRIPT") return ""; let s = ""; if (n.shadowRoot) s += txt(n.shadowRoot); for (const c of n.childNodes) s += txt(c); return s; };`;
const IGNORED = /favicon|net::|GL Driver Message|GPU stall/;

let failures = 0;
const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]});
for (const name of names) {
  console.log(`\n— kit ${name}`);
  doc = JSON.parse(fs.readFileSync(path.join(ROOT, `tests/fixtures/kit-${name}.json`), "utf8"));
  posts.length = 0;
  const page = await (await browser.newContext({viewport: {width: 900, height: 1000}})).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`[${m.type()}] ${m.text()}`); });
  const h = {
    page,
    posts,
    eval: (body, arg) => page.evaluate(new Function("arg", deep + body), arg),
    text: (sel) => page.evaluate(new Function("sel", deep + `return all(sel).map((e) => txt(e).replace(/\\s+/g, " ").trim());`), sel),
    // Vrai clic souris : sonic-action écoute pointerdown / pointerup.
    click: async (sel, i = 0) => {
      const box = await page.evaluate(new Function("a", deep + `const e = all(a[0])[a[1]]; if (!e) return null; e.scrollIntoView({block: "center"}); const r = e.getBoundingClientRect(); return r.width ? {x: r.x + r.width / 2, y: r.y + r.height / 2} : null;`), [sel, i]);
      if (!box) return false;
      await page.mouse.click(box.x, box.y);
      return true;
    },
    state: (id) => page.evaluate(new Function("id", deep + `const s = all("sonic-store").find((e) => !id || e.id === id || e.id.endsWith(id)); return s?.state ? JSON.parse(JSON.stringify(s.state)) : null;`), id),
    wait: (ms) => page.waitForTimeout(ms),
    key: (k) => page.keyboard.press(k),
    visible: (sel) => page.evaluate(new Function("sel", deep + `return all(sel).filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length;`), sel),
    check: (label, ok, detail = "") => {
      console.log(`${ok ? "✔" : "✘"} ${label}${ok || !detail ? "" : "  — " + String(detail).slice(0, 300)}`);
      if (!ok) failures++;
    },
  };
  await page.goto(`http://localhost:${PORT}/kit`);
  await page.waitForTimeout(2500);
  try {
    const scenario = (await import(pathToFileURL(path.join(ROOT, `scripts/kits/${name}.mjs`)).href)).default;
    await scenario(h);
  } catch (e) {
    h.check("scénario", false, e.stack);
  }
  const real = errors.filter((e) => !IGNORED.test(e));
  h.check("aucune erreur JS", real.length === 0, real.join(" | "));
  await page.context().close();
}
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
