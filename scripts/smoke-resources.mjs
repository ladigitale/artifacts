/**
 * Smoke test de la page Ressources (`/admin/ressources`) : miniatures de la liste et fiche en modale.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : node scripts/smoke-resources.mjs
 *
 * Sert dist/ avec la CSP de prod + une fausse API `/api/resources` (shaders et modèle 3D de la bibliothèque
 * de creative-stack, une image SVG, un son WAV, des données JSON). Vérifie : une miniature par ligne (image
 * rendue pour shader, modèle 3D et image, forme d'onde pour le son), la fiche ouverte au clic avec un
 * aperçu vivant, les curseurs qui règlent le shader, la fermeture, le lien `?ref=`, aucune erreur JS / CSP.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = 4455;
const LIB = path.join(ROOT, "node_modules/@supersoniks/creative-stack/src/addons");
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; media-src 'self' https: blob: data:; worker-src 'self' blob:; connect-src 'self' http://localhost:4455 https:; object-src 'none'; base-uri 'self'";

const shaderIndex = JSON.parse(fs.readFileSync(path.join(LIB, "shader/library/library.json"), "utf8"));
const shaderEntries = Array.isArray(shaderIndex) ? shaderIndex : (shaderIndex.entries ?? shaderIndex.shaders ?? []);
const shaderMeta = (id) => shaderEntries.find((e) => e.id === id || e.id === `shader/${id}`) ?? {};

/** WAV mono 16 bits : une note qui s'éteint. */
function wav() {
  const rate = 8000;
  const n = rate / 2;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 440) * 20000 * (1 - i / n)), 44 + i * 2);
  return buf;
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200"><rect width="200" height="200" fill="#f8f9fa"/><circle cx="100" cy="100" r="60" fill="#e63946"/></svg>`;

const resources = [
  {ref: "base:shader/plasma", source: "base", kind: "shader", slug: "shader/plasma", name: "Plasma", params: shaderMeta("plasma").params ?? [], body: fs.readFileSync(path.join(LIB, "shader/library/plasma.glsl")), type: "text/plain; charset=UTF-8"},
  {ref: "base:shader/pixelate", source: "base", kind: "shader", slug: "shader/pixelate", name: "Pixelate", params: shaderMeta("pixelate").params ?? [], body: fs.readFileSync(path.join(LIB, "shader/library/pixelate.glsl")), type: "text/plain; charset=UTF-8"},
  {ref: "mine:casse", source: "mine", kind: "shader", slug: "casse", name: "Shader cassé", params: [], body: Buffer.from("void mainImage(out vec4 c, in vec2 p) { c = vec4(inconnu); }"), type: "text/plain; charset=UTF-8"},
  {ref: "base:3d/pions-6", source: "base", kind: "model3d", slug: "3d/pions-6", name: "Six pions", body: fs.readFileSync(path.join(LIB, "3d/library/pions-6.json")), type: "application/octet-stream"},
  {ref: "base:2d/motif", source: "base", kind: "image", slug: "2d/motif", name: "Motif", body: Buffer.from(SVG), type: "application/octet-stream"},
  {ref: "mine:note", source: "mine", kind: "audio", slug: "note", name: "Note", contentType: "audio/wav", body: wav(), type: "audio/wav"},
  {ref: "mine:cartes", source: "mine", kind: "data", slug: "cartes", name: "Cartes", body: Buffer.from(JSON.stringify({cartes: [{id: "as-coeur"}]}, null, 1)), type: "text/plain; charset=UTF-8"},
].map((r, i) => ({description: `Ressource ${i}`, tags: ["essai"], version: 1, sizeBytes: r.body.length, sha256: `sha-${i}`, ...r}));

const summary = ({body: _b, type: _t, ...r}) => r;
const CORS = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Expose-Headers": "Content-Type"};
let contentHits = 0;

const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  if (u.pathname.startsWith("/api/")) {
    if (q.method === "OPTIONS") return r.writeHead(204, CORS).end();
    const m = /^\/api\/resources\/(.+?)(\/content)?$/.exec(decodeURIComponent(u.pathname));
    if (u.pathname === "/api/resources") {
      r.writeHead(200, {...CORS, "Content-Type": "application/json"});
      return r.end(JSON.stringify({member: resources.map(summary)}));
    }
    const res = m && resources.find((x) => x.ref === m[1]);
    if (res && m[2]) {
      contentHits++;
      r.writeHead(200, {...CORS, "Content-Type": res.type, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Disposition": "attachment"});
      return r.end(res.body);
    }
    if (res) {
      r.writeHead(200, {...CORS, "Content-Type": "application/json"});
      return r.end(JSON.stringify({resource: summary(res), versions: []}));
    }
    r.writeHead(u.pathname.startsWith("/api/resources") ? 404 : 200, {...CORS, "Content-Type": "application/json"});
    return r.end("{}");
  }
  let f = path.join(DIST, u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  const t = f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".svg") ? "image/svg+xml" : "text/html";
  r.writeHead(200, {"Content-Type": t, "Content-Security-Policy": CSP});
  r.end(fs.readFileSync(f));
}).listen(PORT);

let failures = 0;
const check = (label, ok, detail = "") => { console.log(`${ok ? "✔" : "✘"} ${label}${detail ? "  — " + detail : ""}`); if (!ok) failures++; };
const DEEP = `const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };`;
/** `sel` : sélecteur simple, ou « hôte >>> sélecteur » pour chercher dans (les shadow roots de) l'hôte. */
const deepAll = (p, sel, fn) => {
  const [host, inner] = sel.includes(">>>") ? sel.split(">>>").map((x) => x.trim()) : [null, sel];
  const roots = host ? `deep(document, ${JSON.stringify(host)}).flatMap((h) => deep(h.shadowRoot ?? h, ${JSON.stringify(inner)}))` : `deep(document, ${JSON.stringify(inner)})`;
  return p.evaluate(new Function(`${DEEP} return ${roots}.map(${fn.toString()});`));
};

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]});
const errors = [];
const context = await browser.newContext({viewport: {width: 1100, height: 1000}});
await context.addInitScript(() => localStorage.setItem("artifacts-account", JSON.stringify({apiBaseUrl: "http://localhost:4455", token: "t", user: {id: "u", email: "a@b.c"}})));
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused|sonic-|artifact-/i.test(m.text())) errors.push(m.text()); });

await page.goto(`http://localhost:${PORT}/admin/ressources`);
await page.waitForFunction(new Function(`${DEEP} return deep(document, "artifact-resource-thumb").length === ${resources.length};`), null, {timeout: 15000});
// Miniatures : shaders et modèle rendus l'un après l'autre.
await page.waitForFunction(new Function(`${DEEP} return deep(document, "artifact-resource-thumb").every((t) => !t.shadowRoot.querySelector(".pending"));`), null, {timeout: 40000}).catch(() => {});

const thumbs = await deepAll(page, "artifact-resource-thumb", (t) => {
  const img = t.shadowRoot.querySelector("img");
  let ink = -1;
  if (img && img.naturalWidth) {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4) seen.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4},${d[i + 3] >> 4}`);
    ink = seen.size;
  }
  return {kind: t.resource.kind, ref: t.resource.ref, img: !!img, ink, bars: t.shadowRoot.querySelectorAll(".wave rect").length, glyph: t.shadowRoot.querySelector(".box")?.textContent.trim() ?? ""};
});
const by = (ref) => thumbs.find((t) => t.ref === ref) ?? {};
check("une miniature par ligne", thumbs.length === resources.length, String(thumbs.length));
check("shader : image rendue, pas unie (plasma)", by("base:shader/plasma").ink > 3, JSON.stringify(by("base:shader/plasma")));
check("shader de traitement : rendu sur l'image d'essai (pixelate)", by("base:shader/pixelate").ink > 3, JSON.stringify(by("base:shader/pixelate")));
check("shader qui ne compile pas : repli sur le pictogramme", !by("mine:casse").img && by("mine:casse").glyph === "ƒ", JSON.stringify(by("mine:casse")));
check("modèle 3D : image rendue", by("base:3d/pions-6").ink > 2, JSON.stringify(by("base:3d/pions-6")));
check("image : affichée (SVG sans type annoncé)", by("base:2d/motif").ink >= 2, JSON.stringify(by("base:2d/motif")));
check("son : forme d'onde", by("mine:note").bars === 40, JSON.stringify(by("mine:note")));
check("données : pictogramme", by("mine:cartes").glyph === "{ }", JSON.stringify(by("mine:cartes")));
const stage = await page.evaluate(() => document.querySelectorAll("body > div[aria-hidden] sonic-shader, body > div[aria-hidden] sonic-3d").length);
check("le studio des miniatures ne laisse aucun rendu monté", stage === 0, String(stage));
const hitsAfterList = contentHits;
check("un seul téléchargement de contenu par ressource", hitsAfterList === resources.length, String(hitsAfterList));
await page.screenshot({path: "/tmp/smoke-resources-list.png"});

const openRow = async (name) => {
  const box = (await deepAll(page, "button.row", (b) => ({name: b.querySelector(".name").textContent, r: b.getBoundingClientRect().toJSON()}))).find((b) => b.name.includes(name));
  await page.mouse.click(box.r.x + box.r.width / 2, box.r.y + box.r.height / 2);
  await page.waitForTimeout(1500);
};
const closeModal = async () => {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
};
const modalOpen = async () => (await deepAll(page, "sonic-modal", (m) => m.visible === true && !!m.shadowRoot.querySelector("dialog[open]")))[0] === true;
const pixel = () => deepAll(page, "artifact-resource-preview >>> sonic-shader", (s) => {
  const src = s.getFrameCanvas();
  if (!src) return null;
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 8;
  const g = c.getContext("2d");
  g.drawImage(src, 0, 0, 8, 8);
  return Array.from(g.getImageData(0, 0, 8, 8).data).join(",");
});

await openRow("Pixelate");
check("clic sur une ligne : la fiche s'ouvre en modale", await modalOpen());
const shaderOk = (await deepAll(page, "artifact-resource-preview >>> sonic-shader", (s) => !!s.getFrameCanvas() && s.frameSeq > 0))[0];
check("fiche d'un shader : rendu vivant", shaderOk === true, String(shaderOk));
const sliders = await deepAll(page, "artifact-resource-preview >>> sonic-slider", (s) => ({label: s.label, r: s.shadowRoot.querySelector("input").getBoundingClientRect().toJSON()}));
check("fiche d'un shader : un curseur par réglage", sliders.length === (shaderMeta("pixelate").params ?? []).length && sliders.length > 0, JSON.stringify(sliders.map((s) => s.label)));
const before = (await pixel())[0];
await page.mouse.click(sliders[0].r.x + 6, sliders[0].r.y + sliders[0].r.height / 2);
await page.waitForTimeout(500);
const after = (await pixel())[0];
check("le curseur règle le shader en direct", !!before && !!after && before !== after);
await page.screenshot({path: "/tmp/smoke-resources-shader.png"});
check("l'aperçu ne relit pas le contenu déjà chargé pour la miniature", contentHits <= hitsAfterList + 1, `${contentHits - hitsAfterList} lecture(s) de plus`);
await closeModal();
check("Échap referme la fiche", !(await modalOpen()));
const left = (await deepAll(page, "artifact-resource-preview", () => 1)).length;
check("fiche fermée : plus d'aperçu monté", left === 0, String(left));

await openRow("Shader cassé");
const alert = (await deepAll(page, "artifact-resource-preview >>> [role=alert]", (n) => n.textContent.trim()))[0];
check("shader qui ne compile pas : l'erreur est dite dans la fiche", /inconnu|undeclared|image/i.test(alert ?? ""), String(alert));
await closeModal();

await openRow("Six pions");
const model = (await deepAll(page, "artifact-resource-preview >>> sonic-3d", (s) => !!s.getFrameCanvas()))[0];
check("fiche d'un modèle 3D : scène rendue", model === true, String(model));
await page.screenshot({path: "/tmp/smoke-resources-3d.png"});
await closeModal();

await openRow("Motif");
const image = (await deepAll(page, "artifact-resource-preview >>> img", (i) => i.naturalWidth))[0];
check("fiche d'une image : affichée", image > 0, String(image));
await closeModal();

await openRow("Note");
const audio = (await deepAll(page, "artifact-resource-preview >>> audio", (a) => ({d: a.duration, bars: a.parentElement.querySelectorAll(".wave rect").length})))[0];
check("fiche d'un son : lecteur et forme d'onde", audio?.d > 0.4 && audio.bars === 96, JSON.stringify(audio));
await closeModal();

await openRow("Cartes");
const text = (await deepAll(page, "artifact-resource-preview >>> pre", (p) => p.textContent))[0];
check("fiche de données : contenu en texte", /as-coeur/.test(text ?? ""), String(text).slice(0, 60));
await closeModal();

await page.goto(`http://localhost:${PORT}/admin/ressources?ref=${encodeURIComponent("base:shader/plasma")}`);
await page.waitForTimeout(2500);
const title = (await deepAll(page, "sonic-modal-title", (t) => t.textContent.trim()))[0];
check("lien ?ref= : la fiche s'ouvre directement", (await modalOpen()) && title === "Plasma", String(title));

const narrow = await context.newPage();
await narrow.setViewportSize({width: 390, height: 800});
await narrow.goto(`http://localhost:${PORT}/admin/ressources`);
await narrow.waitForTimeout(2500);
const overflow = await narrow.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("mobile : la liste ne déborde pas", overflow <= 1, String(overflow));
await narrow.screenshot({path: "/tmp/smoke-resources-mobile.png"});

check("aucune erreur JS / CSP", errors.length === 0, errors.join(" | ").slice(0, 600));
await browser.close();
server.close();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert");
process.exit(failures ? 1 : 0);
