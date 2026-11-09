/**
 * Smoke test de `sonic-palette` (creative-stack, addon color) : palette d'harmonie reliée au pinceau d'un `sonic-sketch`.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-palette.mjs
 *
 * Vérifie : six pastilles (triade + nuances) distinctes, couleur de départ envoyée au store, clic → couleur du pinceau
 * et du trait, flèches au clavier, changement de règle suivi par le pinceau, aucune erreur JS / CSP.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/palette.json"), "utf8"));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; connect-src 'self' http://localhost:4455 https:; object-src 'none'; base-uri 'self'";

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  if (/^\/api\/public\/artifacts\/([^/]+)/.test(u.pathname)) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    return r.end(JSON.stringify({id: "palette", slug: "palette", title: doc.title, description: "", visibility: "link", document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
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
const page = await (await browser.newContext({viewport: {width: 900, height: 900}})).newPage();
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused|sonic-/i.test(m.text())) errors.push(m.text()); });
await page.goto(`http://localhost:${PORT}/palette?k=tok`);
await page.waitForTimeout(1500);

/** Exécute fn(el, arg) sur le premier élément `tag` (shadow DOM compris). */
const on = (tag, fn, arg) => page.evaluate(([tag, fn, arg]) => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.tagName === tag) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  const el = deep(document)[0];
  return el ? new Function("el", "arg", `return (${fn})(el, arg)`)(el, arg) : null;
}, [tag, fn.toString(), arg]);
const pal = (fn, arg) => on("SONIC-PALETTE", fn, arg);
const sketch = (fn, arg) => on("SONIC-SKETCH", fn, arg);
const hex = (p) => "#" + p.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("");

const s0 = await pal((el) => el.getState());
check("six couleurs distinctes, la base en premier", s0 && s0.colors.length === 6 && new Set(s0.colors).size === 6 && s0.colors[0] === "#c2410c", JSON.stringify(s0?.colors));
check("triade : trois teintes à 120°", s0 && s0.items.slice(0, 3).every((c) => c.role !== "shade"), JSON.stringify(s0?.items.map((c) => c.role)));
check("six pastilles rendues", (await pal((el) => el.shadowRoot.querySelectorAll("button").length)) === 6);
check("couleur de départ envoyée au pinceau", (await sketch((el) => el.getState().color)) === "#c2410c", await sketch((el) => el.getState().color));

// Clic sur la troisième pastille.
const b = await pal((el) => { const r = el.shadowRoot.querySelectorAll("button")[2].getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; });
await page.mouse.click(b.x, b.y);
await page.waitForTimeout(150);
const s1 = await pal((el) => el.getState());
check("clic : choix publié", s1.selectedIndex === 2 && s1.selected === s0.colors[2], JSON.stringify({i: s1.selectedIndex, c: s1.selected}));
check("… et couleur du pinceau", (await sketch((el) => el.getState().color)) === s0.colors[2]);
check("… pastille marquée (aria-pressed)", (await pal((el) => el.shadowRoot.querySelectorAll("button")[2].getAttribute("aria-pressed"))) === "true");

// Un trait prend cette couleur.
const box = await sketch((el) => { const r = el.getFrameCanvas().getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, cw: el.getFrameCanvas().width}; });
const k = box.cw / box.w;
await page.mouse.move(box.x + 100 / k, box.y + 150 / k);
await page.mouse.down();
await page.mouse.move(box.x + 500 / k, box.y + 150 / k, {steps: 10});
await page.mouse.up();
await page.waitForTimeout(150);
const px = await sketch((el) => Array.from(el.getFrameCanvas().getContext("2d").getImageData(300, 150, 1, 1).data));
check("le trait a la couleur choisie", hex(px) === s0.colors[2], hex(px));

// Clavier : flèche droite depuis la pastille choisie (le trait a donné le focus à la toile).
await pal((el) => el.shadowRoot.querySelectorAll("button")[2].focus());
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(100);
const s2 = await pal((el) => el.getState());
check("flèche droite : pastille suivante", s2.selectedIndex === 3 && (await sketch((el) => el.getState().color)) === s0.colors[3], String(s2.selectedIndex));

// Changement de règle : le pinceau suit la couleur au même rang.
await pal((el) => { el.rule = "complementary"; });
await page.waitForTimeout(150);
const s3 = await pal((el) => el.getState());
check("règle complémentaire : six couleurs, rang gardé", s3.rule === "complementary" && s3.colors.length === 6 && s3.selectedIndex === 3, JSON.stringify(s3.colors));
check("… le pinceau suit", (await sketch((el) => el.getState().color)) === s3.colors[3]);

await page.screenshot({path: "/tmp/smoke-palette.png"});
check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 400));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
