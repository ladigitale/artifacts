/**
 * Fluidité de la pile de mots de l'accueil : pendant une chute (gravité inversée), compare à
 * chaque image la position calculée par la physique et la position affichée par sonic-stage.
 * Échoue si l'affichage reste figé sur plus de 15 % des images où la physique bouge, ou si un mot
 * traîne de plus de 30 px (unités de la scène) derrière son corps.
 *
 * Prérequis : VITE_API_BASE_URL=http://localhost:4455 yarn build
 * Lancer   : CHROME_PATH=…/chrome node scripts/smoke-hero-fluidite.mjs   (THROTTLE=4 : processeur ralenti)
 */
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import {chromium} from "playwright";
const DIST = path.join(process.cwd(), process.env.DIST || "dist");
const s = http.createServer((q, r) => { const u = new URL(q.url, "http://x"); if (u.pathname.startsWith("/api/")) { r.writeHead(200, {"Content-Type": "application/json"}); return r.end('{"member":[]}'); } let f = path.join(DIST, u.pathname); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html"); r.writeHead(200, {"Content-Type": f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".svg") ? "image/svg+xml" : "text/html"}); r.end(fs.readFileSync(f)); }).listen(4455);
const b = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"]});
const ctx = await b.newContext({viewport: {width: 1280, height: 900}});
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await cdp.send("Emulation.setCPUThrottlingRate", {rate: Number(process.env.THROTTLE || 4)});
await p.goto("http://localhost:4455/"); await p.waitForTimeout(5000);
const deep = `const deep = (r, s, a = []) => { r.querySelectorAll("*").forEach((e) => { if (e.matches(s)) a.push(e); if (e.shadowRoot) deep(e.shadowRoot, s, a); }); return a; };`;
const run = (ms) => p.evaluate(new Function("ms", `${deep}
  const phys = deep(document, "sonic-physics")[0]; const stage = deep(document, "sonic-stage")[0];
  const names = ["idee","quiz","jeu","instrument","carte","dessin","sondage"];
  const els = names.map((n) => deep(document, "#" + n)[0]);
  const k = () => stage.getBoundingClientRect().width / 560;
  const s0 = stage.getBoundingClientRect();
  return new Promise((res) => { const rows = []; let prev = null; const t0 = performance.now();
    const tick = (now) => {
      const sim = names.map((n) => { const st = phys.sim.bodyState(n); return [st.x, st.y]; });
      const disp = els.map((e) => { const r = e.getBoundingClientRect(); return [(r.x + r.width/2 - s0.x) / k(), (r.y + r.height/2 - s0.y) / k()]; });
      if (prev) rows.push({dt: now - prev.now,
        simMoved: sim.some((p, i) => Math.hypot(p[0]-prev.sim[i][0], p[1]-prev.sim[i][1]) > 0.3),
        dispMoved: disp.some((p, i) => Math.hypot(p[0]-prev.disp[i][0], p[1]-prev.disp[i][1]) > 0.3),
        lag: Math.max(...sim.map((p, i) => Math.hypot(p[0]-disp[i][0], p[1]-disp[i][1]))),
        jump: Math.max(...disp.map((p, i) => Math.hypot(p[0]-prev.disp[i][0], p[1]-prev.disp[i][1]))) });
      prev = {now, sim, disp};
      if (now - t0 < ms) requestAnimationFrame(tick); else res(rows); };
    requestAnimationFrame(tick); });`), ms);
const sw = await p.evaluate(new Function(`${deep} const r = deep(document, "#bascule")[0].getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2};`));
await p.mouse.click(sw.x, sw.y);
const rows = (await run(1500)).filter((r) => r.simMoved);
const frozen = rows.filter((r) => !r.dispMoved).length;
const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
const lagMax = Math.max(...rows.map((r) => r.lag));
const frozenPct = (100 * frozen) / rows.length;
const ok = rows.length > 20 && frozenPct <= 15 && lagMax <= 30;
console.log(`${ok ? "✔" : "✘"} pile de l'accueil, CPU ÷${process.env.THROTTLE || 4} : ${rows.length} images où la physique bouge ; affichage figé sur ${frozen} (${Math.round(100*frozen/rows.length)} %) ; retard médian ${med(rows.map(r=>r.lag)).toFixed(1)} px, max ${Math.max(...rows.map(r=>r.lag)).toFixed(0)} px ; plus gros saut ${Math.max(...rows.map(r=>r.jump)).toFixed(0)} px ; image médiane ${med(rows.map(r=>r.dt)).toFixed(1)} ms`);
await b.close(); s.close();
process.exit(ok ? 0 : 1);
