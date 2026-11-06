/**
 * Smoke test de `sonic-paint` (creative-stack, addon paint) : peinture à la souris dans le viewer.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-paint.mjs
 *
 * Sert dist/ avec la CSP de prod + une fausse API publique (tests/fixtures/paint.json).
 * Vérifie : réglages du store appliqués, trait à la souris, gomme, annuler / rétablir, source d'images
 * (frameSeq qui avance), enregistrement PNG, aucune erreur JS / CSP.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/paint.json"), "utf8"));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; connect-src 'self' http://localhost:4455 https:; object-src 'none'; base-uri 'self'";

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  if (/^\/api\/public\/artifacts\/([^/]+)/.test(u.pathname)) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    return r.end(JSON.stringify({id: "paint", slug: "paint", title: doc.title, description: "", visibility: "link", document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
  }
  let f = path.join(DIST, u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  const t = f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".svg") ? "image/svg+xml" : "text/html";
  r.writeHead(200, {"Content-Type": t, "Content-Security-Policy": CSP});
  r.end(fs.readFileSync(f));
}).listen(PORT);

let failures = 0;
const check = (label, ok, detail = "") => { console.log(`${ok ? "✔" : "✘"} ${label}${detail ? "  — " + detail : ""}`); if (!ok) failures++; };
const deepEval = (p, sel, fn, arg) => p.evaluate(([sel, fn, arg]) => {
  const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };
  const el = deep(document, sel)[0];
  return el ? new Function("el", `return (${fn})(el)`)(el) : null;
}, [sel, fn.toString(), arg]);

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"]});
const errors = [];
const page = await (await browser.newContext({viewport: {width: 900, height: 1400}})).newPage();
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused|sonic-/i.test(m.text())) errors.push(m.text()); });
await page.goto(`http://localhost:${PORT}/paint?k=tok`);
await page.waitForTimeout(1500);
const get = (fn, arg) => page.evaluate(([fn, arg]) => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.tagName === "SONIC-PAINT") a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  const el = deep(document)[0];
  return el ? new Function("el", "arg", `return (${fn})(el, arg)`)(el, arg) : null;
}, [fn.toString(), arg]);
const pixel = (x, y) => get((el, [x, y]) => { const c = el.getFrameCanvas(); const d = c.getContext("2d").getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2], d[3]]; }, [x, y]);
const box = await get((el) => { const r = el.getFrameCanvas().getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height, cw: el.getFrameCanvas().width}; });
const k = box.cw / box.w;
const at = (cx, cy) => [box.x + cx / k, box.y + cy / k];

const white = await pixel(300, 200);
check("fond blanc au départ", white[0] === 255 && white[1] === 255 && white[3] === 255, JSON.stringify(white));
const seq0 = await get((el) => el.frameSeq);

await page.mouse.move(...at(100, 200));
await page.mouse.down();
for (let i = 0; i <= 20; i++) await page.mouse.move(...at(100 + i * 20, 200), {steps: 2});
await page.mouse.up();
await page.waitForTimeout(200);
const stroke = await pixel(300, 200);
check("trait dessiné avec la couleur du store (#e11d48)", Math.abs(stroke[0] - 225) < 6 && Math.abs(stroke[1] - 29) < 8 && Math.abs(stroke[2] - 72) < 8, JSON.stringify(stroke));
const off = await pixel(300, 300);
check("hors du trait, la toile reste blanche", off[0] === 255 && off[1] === 255, JSON.stringify(off));
const edge = await pixel(300, 200 + 14);
check("bord progressif (dureté 0,8) : pixel intermédiaire", edge[1] > 29 && edge[1] < 255, JSON.stringify(edge));
const seq1 = await get((el) => el.frameSeq);
check("la source d'images avance à chaque trait", seq1 > seq0 + 5, `${seq0} → ${seq1}`);
const st = await get((el) => el.getState());
check("état : un trait, annulation possible", st.strokes === 1 && st.canUndo && !st.canRedo && !st.drawing, JSON.stringify(st));

await get((el) => el.undo());
const undone = await pixel(300, 200);
check("annuler rend le blanc", undone[0] === 255 && undone[1] === 255, JSON.stringify(undone));
await get((el) => el.redo());
const redone = await pixel(300, 200);
check("rétablir rend le trait", Math.abs(redone[0] - 225) < 6, JSON.stringify(redone));

await get((el) => { el.tool = "erase"; });
await page.mouse.move(...at(200, 200));
await page.mouse.down();
await page.mouse.move(...at(260, 200), {steps: 6});
await page.mouse.up();
await page.waitForTimeout(150);
const erased = await pixel(230, 200);
check("la gomme rend la toile transparente", erased[3] < 20, JSON.stringify(erased));

await get((el) => el.save());
await page.waitForTimeout(500);
const saved = await get((el) => el.getState().last);
check("enregistrement PNG en blob:", saved && saved.url.startsWith("blob:") && saved.mime === "image/png" && saved.width === 600 && saved.size > 500, JSON.stringify(saved));
await get((el) => el.clear());
const cleared = await pixel(100, 200);
check("effacer tout remet le fond", cleared[0] === 255 && cleared[3] === 255, JSON.stringify(cleared));
await page.screenshot({path: "/tmp/smoke-paint.png"});
check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 400));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
