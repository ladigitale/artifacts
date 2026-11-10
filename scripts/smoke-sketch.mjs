/**
 * Smoke test de `sonic-sketch` (creative-stack, addon sketch) : dessin vectoriel à zoom infini dans le viewer.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-sketch.mjs
 *
 * Vérifie : trait à la souris, zoom à la molette (trait redessiné net), déplacement (Espace + glisser),
 * zoom extrême et retour, pointe personnalisée, gomme de traits, annuler / rétablir, export SVG valide,
 * fusion vectorielle des traits pleins, compaction, mode de fusion multiply, aucune erreur JS / CSP.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/sketch.json"), "utf8"));
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; connect-src 'self' http://localhost:4455 https:; object-src 'none'; base-uri 'self'";

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  if (/^\/api\/public\/artifacts\/([^/]+)/.test(u.pathname)) {
    r.writeHead(200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"});
    if (u.pathname.includes("/collections/")) return r.end('{"member":[]}');
    return r.end(JSON.stringify({id: "sketch", slug: "sketch", title: doc.title, description: "", visibility: "link", document: doc, scriptAssets: [], version: 1, updatedAt: new Date().toISOString(), collections: [], canWrite: false}));
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
await page.goto(`http://localhost:${PORT}/sketch?k=tok`);
await page.waitForTimeout(1500);
const get = (fn, arg) => page.evaluate(([fn, arg]) => {
  const deep = (r, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.tagName === "SONIC-SKETCH") a.push(e); if (e.shadowRoot) deep(e.shadowRoot, a); }); return a; };
  const el = deep(document)[0];
  return el ? new Function("el", "arg", `return (${fn})(el, arg)`)(el, arg) : null;
}, [fn.toString(), arg]);
const pixel = (x, y) => get((el, [x, y]) => { const c = el.getFrameCanvas(); const d = c.getContext("2d").getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2], d[3]]; }, [x, y]);
const box = await get((el) => { const r = el.getFrameCanvas().getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height, cw: el.getFrameCanvas().width}; });
const k = box.cw / box.w;
const at = (cx, cy) => [box.x + cx / k, box.y + cy / k];


const state = () => get((el) => el.getState());
const isRed = (p) => Math.abs(p[0] - 225) < 8 && Math.abs(p[1] - 29) < 10 && Math.abs(p[2] - 72) < 10 && p[3] === 255;
const isWhite = (p) => p[0] === 255 && p[1] === 255 && p[2] === 255;
const drag = async (x0, y0, x1, y1) => {
  await page.mouse.move(...at(x0, y0));
  await page.mouse.down();
  await page.mouse.move(...at(x1, y1), {steps: 12});
  await page.mouse.up();
  await page.waitForTimeout(150);
};

check("fond blanc au départ", isWhite(await pixel(300, 200)));
const seq0 = await get((el) => el.frameSeq);
await drag(100, 200, 500, 200);
let p = await pixel(300, 200);
check("trait dessiné avec la couleur du store", isRed(p), JSON.stringify(p));
check("hors du trait, blanc (±10 px de la ligne : 15 px est dehors)", isWhite(await pixel(300, 215)));
let st = await state();
check("état : un trait, zoom 1", st.strokes === 1 && st.canUndo && Math.abs(st.zoom - 1) < 1e-9, JSON.stringify({s: st.strokes, z: st.zoom}));
check("la source d'images avance", (await get((el) => el.frameSeq)) > seq0);

// Zoom à la molette sous le curseur : le trait (20 unités du monde) grossit et reste net.
await page.mouse.move(...at(300, 200));
for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -256);
await page.waitForTimeout(400);
st = await state();
check("la molette zoome (×4 en trois crans)", Math.abs(st.zoom - 4) < 0.25, String(st.zoom));
const z = st.zoom;
check("le trait a grossi avec le zoom (35 px du centre encore rouge)", isRed(await pixel(300, 200 + 35)), JSON.stringify(await pixel(300, 200 + 35)));
check("… et s'arrête à 10 unités × zoom", isWhite(await pixel(300, 200 + Math.round(10 * z) + 4)));
const sharp = await pixel(300, 200 + Math.round(10 * z) - 3);
check("bord net après redessin (pas de flou)", isRed(sharp), JSON.stringify(sharp));

// Déplacer : Espace + glisser de 100 px à gauche.
await page.keyboard.down("Space");
await drag(300, 100, 200, 100);
await page.keyboard.up("Space");
await page.waitForTimeout(300);
const st2 = await state();
check("Espace + glisser déplace la vue sans tracer", Math.abs((st2.x - st.x) - 100 / z) < 0.5 && st2.strokes === 1, JSON.stringify({dx: st2.x - st.x, exp: 100 / z, strokes: st2.strokes}));

// Outil main.
await get((el) => { el.tool = "hand"; });
await drag(200, 100, 300, 100);
await get((el) => { el.tool = "paint"; });
const st3 = await state();
check("tool=hand déplace aussi", Math.abs(st3.x - st.x) < 0.5 && st3.strokes === 1, String(st3.x - st.x));

// Zoom extrême puis retour : le trait reste net et le tracé fin se range sur l'échelle.
await get((el) => el.fit());
for (let i = 0; i < 40; i++) await get((el) => el.zoomIn());
st = await state();
check("zoom borné à 10 000 000", st.zoom === 1e7, String(st.zoom));
check("au zoom maximal, le trait remplit l'écran", isRed(await pixel(300, 200)) && isRed(await pixel(10, 390)));
await drag(250, 200, 350, 200);
st = await state();
check("trait minuscule dessiné à zoom extrême", st.strokes === 2 && st.bbox.w > 400 && st.zoom === 1e7, JSON.stringify(st.bbox));
await get((el) => el.fit());
st = await state();
check("cadrer ramène une échelle lisible", st.zoom > 0.5 && st.zoom < 3, String(st.zoom));
await get((el) => el.undo());
st = await state();
check("annuler retire le trait minuscule", st.strokes === 1 && st.canRedo, JSON.stringify(st.strokes));
await get((el) => el.redo());

// Pointe personnalisée : barre verticale 2 × 20 px (taille 20 du store), sans bout arrondi.
await get((el) => el.reset());
await get((el) => el.clear());
await get((el) => { el.tip = "M-1 -10L1 -10L1 10L-1 10Z"; });
await drag(200, 200, 400, 200);
const tipMid = await pixel(300, 200 + 8);
const tipCap = await pixel(193, 200);
const tipTop = await pixel(300, 200 - 12);
check("pointe en barre : haute de 20 px au milieu", isRed(tipMid), JSON.stringify(tipMid));
check("… sans bout arrondi (un disque couvrirait le point à 7 px du départ)", isWhite(tipCap), JSON.stringify(tipCap));
check("… et pas plus haute que la pointe", isWhite(tipTop), JSON.stringify(tipTop));
await get((el) => { el.tip = ""; });

// Gomme de traits.
await drag(100, 100, 500, 100);
st = await state();
check("deux traits", st.strokes === 2, String(st.strokes));
await get((el) => { el.tool = "erase"; });
await page.mouse.move(...at(300, 100));
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(150);
st = await state();
check("la gomme retire le trait touché, pas l'autre", st.strokes === 1, String(st.strokes));
check("… le pixel redevient blanc", isWhite(await pixel(300, 100)));
await get((el) => { el.tool = "paint"; });
await get((el) => el.undo());
st = await state();
check("annuler la gomme rend le trait", st.strokes === 2 && isRed(await pixel(300, 100)), String(st.strokes));

// Export SVG.
await get((el) => el.save());
await page.waitForTimeout(300);
const last = await get((el) => el.getState().last);
check("enregistrement SVG en blob:", last && last.url.startsWith("blob:") && last.mime === "image/svg+xml" && last.size > 100, JSON.stringify(last));
const svg = await get((el) => el.toSvg());
const parsed = await page.evaluate((t) => { const d = new DOMParser().parseFromString(t, "image/svg+xml"); return {err: !!d.querySelector("parsererror"), paths: d.querySelectorAll("path").length, uses: d.querySelectorAll("use").length, vb: d.documentElement.getAttribute("viewBox")}; }, svg);
check("SVG valide avec un tracé par trait net et les <use> de la pointe", !parsed.err && parsed.paths >= 2 && parsed.uses > 10 && !!parsed.vb, JSON.stringify(parsed));

// Fusion vectorielle : deux traits pleins qui se croisent deviennent une seule forme (découpage polygonal).
await get((el) => { el.reset(); el.clear(); });
await drag(100, 300, 500, 300);
await drag(300, 250, 300, 380);
st = await state();
check("fusion : deux traits pleins qui se croisent → une seule forme", st.strokes === 1 && st.shapes === 1 && st.merges >= 1, JSON.stringify({s: st.strokes, sh: st.shapes, m: st.merges}));
check("… dessinée : croisement et bras rouges, dehors blanc", isRed(await pixel(300, 300)) && isRed(await pixel(300, 370)) && isRed(await pixel(120, 300)) && isWhite(await pixel(200, 350)));
check("… compaction : le dernier trait a perdu des points", st.lastStroke.after < st.lastStroke.before, JSON.stringify(st.lastStroke));
await get((el) => el.undo());
st = await state();
check("annuler la fusion rend le premier trait seul", st.strokes === 1 && st.shapes === 0 && isWhite(await pixel(300, 370)), JSON.stringify({s: st.strokes, sh: st.shapes}));
await get((el) => el.redo());
const svg2 = await page.evaluate((t) => { const d = new DOMParser().parseFromString(t, "image/svg+xml"); return {err: !!d.querySelector("parsererror"), paths: d.querySelectorAll("path").length, evenodd: d.querySelectorAll('path[fill-rule="evenodd"]').length}; }, await get((el) => el.toSvg()));
check("export : la forme fusionnée est un seul chemin rempli", !svg2.err && svg2.paths === 1 && svg2.evenodd === 1, JSON.stringify(svg2));

// Mode de fusion multiply : rouge sur rouge s'assombrit, rouge sur blanc reste rouge ; pas fusionné avec la forme normale.
await get((el) => { el.blend = "multiply"; });
await drag(200, 250, 200, 380);
st = await state();
const dark = await pixel(200, 300);
check("multiply : rouge × rouge assombrit (≈ 198, 3, 20)", Math.abs(dark[0] - 198) < 10 && dark[1] < 12 && Math.abs(dark[2] - 20) < 10, JSON.stringify(dark));
check("… sur le blanc, la couleur du trait", isRed(await pixel(200, 360)), JSON.stringify(await pixel(200, 360)));
check("… trait gardé à part (autre mode), état blend", st.strokes === 2 && st.blend === "multiply", JSON.stringify({s: st.strokes, b: st.blend}));
check("… export : groupe mix-blend-mode", (await get((el) => el.toSvg())).includes("mix-blend-mode:multiply"));
await get((el) => { el.blend = "normal"; });

await page.screenshot({path: "/tmp/smoke-sketch.png"});
check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 400));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
