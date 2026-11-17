/**
 * Section « Comment ça marche » de l'accueil : un aquarium épinglé au défilement.
 * Document d'artefact rendu par le viewer, entièrement en briques de la creative-stack :
 * - `sonic-scroll` mesure l'avancement de la scène épinglée (section haute de 340vh, bloc sticky) ;
 * - `sonic-cursor` publie le pointeur sans rien détourner (le shader reste transparent aux gestes :
 *   le défilement tactile passe au travers) ;
 * - leurs attributs `map` calculent à chaque image les réglages du shader (`uParam0..3`), et une
 *   `sonic-timeline` lue sur l'avancement fait apparaître les cartes d'étape via `sonic-stage` ;
 * - `sonic-shader colors=…` dessine l'eau, la lumière, la trame et le banc de poissons aux couleurs du thème.
 *
 * Trois étapes : on décrit (une bulle-idée tombe dans l'eau), l'assistant fabrique (les poissons
 * dessinent une page), c'est en ligne (la page se pose, le lien apparaît, le banc repart).
 */

const COLORS = "--sc-base-50 --sc-base-content --sc-accent --sc-deco-2 --sc-deco-1 --sc-deco-3 --sc-deco-4 --sc-base";

const SHADER = /* glsl */ `
#define PAPER uColor0.rgb
#define INK   uColor1.rgb
#define ACC   uColor2.rgb
#define WATER uColor3.rgb
#define FISH1 uColor4.rgb
#define FISH2 uColor5.rgb
#define FISH3 uColor6.rgb
#define CARD  uColor7.rgb
const int N = 12;

float h1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float sdBox(vec2 p, vec2 b, float r) { vec2 d = abs(p) - b + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float sdTri(vec2 p, vec2 a, vec2 b, vec2 c) {
  vec2 e0 = b - a, e1 = c - b, e2 = a - c, v0 = p - a, v1 = p - b, v2 = p - c;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)), vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))), vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}

float PX;
float fill(float d) { return 1.0 - smoothstep(-PX, PX, d); }
void layer(inout vec3 col, vec3 c, float d, float line) {
  col = mix(col, INK, fill(d - line));
  col = mix(col, c, fill(d));
}

/* Avancement de la scène : 0..1 (uParam0), et ses trois temps. */
float P() { return clamp(uParam0, 0.0, 1.0); }
float formK() { return smoothstep(0.30, 0.47, P()) * (1.0 - smoothstep(0.66, 0.80, P())); }
float publishK() { return smoothstep(0.64, 0.80, P()); }

float narrow(float A) { return 1.0 - smoothstep(0.8, 1.1, A); }
vec2 cardCenter(float A) { float n = narrow(A); return vec2(A * mix(0.62, 0.5, n), mix(0.46, 0.34, n) - 0.06 * publishK()); }
vec2 cardHalf(float A) { float n = narrow(A); return vec2(mix(min(0.27 * A, 0.26), A * 0.36, n), mix(0.2, 0.15, n)) * (0.6 + 0.4 * smoothstep(0.28, 0.5, P())); }

vec2 perimeter(float u, vec2 c, vec2 h) {
  float w = 2.0 * h.x, ht = 2.0 * h.y, L = 2.0 * (w + ht), s = fract(u) * L;
  vec2 tl = c - h;
  if (s < w) return tl + vec2(s, 0.0);
  s -= w; if (s < ht) return tl + vec2(w, s);
  s -= ht; if (s < w) return tl + vec2(w - s, ht);
  s -= w; return tl + vec2(0.0, ht - s);
}

vec2 fishPos(int i, float t, float A) {
  float fi = float(i), s = h1(fi + 1.0), s2 = h1(fi + 7.0);
  vec2 free = vec2(
    A * 0.5 + A * 0.44 * sin(t * (0.10 + 0.05 * s) + fi * 1.7),
    0.44 + 0.24 * sin(t * (0.15 + 0.05 * s2) + fi * 2.3) + 0.03 * sin(t * 1.1 + fi));
  vec2 ring = perimeter(fi / float(N) + t * 0.025, cardCenter(A), cardHalf(A) + 0.035);
  vec2 p = mix(free, ring, formK());
  if (uParam2 >= 0.0) {
    vec2 m = vec2(uParam2 * A, uParam3);
    vec2 d = p - m;
    float l = length(d);
    if (l < 0.2) p += d / max(l, 1e-3) * (0.2 - l) * 0.9;
  }
  return p;
}

void drawFish(inout vec3 col, vec2 q, int i, float A, float t) {
  vec2 p0 = fishPos(i, t, A), p1 = fishPos(i, t + 0.06, A);
  vec2 dir = p1 - p0;
  float l = length(dir);
  dir = l > 1e-5 ? dir / l : vec2(1.0, 0.0);
  float sz = 0.75 + 0.5 * h1(float(i) + 3.0);
  vec2 r = q - p0;
  if (dot(r, r) > 0.012 * sz * sz) return;
  vec2 lp = vec2(dot(r, dir), dot(r, vec2(-dir.y, dir.x))) / sz;
  float wag = sin(t * 9.0 + float(i) * 2.0) * (0.25 + 0.6 * clamp(uParam1, 0.0, 1.0));
  vec2 tailA = vec2(-0.034, 0.0), tailB = vec2(-0.062, 0.022 + wag * 0.012), tailC = vec2(-0.062, -0.022 + wag * 0.012);
  float body = length(lp / vec2(0.04, 0.021)) - 1.0;
  body *= 0.021;
  float d = min(body, sdTri(lp, tailA, tailB, tailC));
  int k = int(mod(float(i), 3.0));
  vec3 c = k == 0 ? FISH1 : (k == 1 ? FISH2 : FISH3);
  layer(col, c, d * sz, 2.2 * PX);
  col = mix(col, mix(c, PAPER, 0.45), fill(sdSeg(lp, vec2(-0.004, -0.013), vec2(-0.004, 0.013)) * sz - 2.2 * PX));
  col = mix(col, INK, fill((length(lp - vec2(0.022, 0.006)) - 0.0055) * sz));
}

void mainImage(out vec4 o, in vec2 f) {
  PX = 1.0 / iResolution.y;
  float A = iResolution.x / iResolution.y;
  vec2 q = vec2(f.x, iResolution.y - f.y) * PX;
  float t = iTime;
  float p = P();
  bool dark = lum(PAPER) < 0.5;

  /* Eau : clair en haut, profond en bas ; trame de points nette en profondeur. */
  float depth = smoothstep(0.0, 1.0, q.y);
  vec3 deep = dark ? mix(WATER, PAPER, 0.78) : mix(WATER, INK, 0.5);
  vec3 col = mix(mix(WATER, PAPER, dark ? 0.0 : 0.25), deep, depth);
  vec2 g = mod(f, 9.0) - 4.5;
  float dotR = depth * 2.6;
  col = mix(col, mix(deep, INK, dark ? 0.0 : 0.35), (1.0 - smoothstep(dotR - 0.6, dotR + 0.6, length(g))) * 0.55);

  /* Lumière qui danse : réseau de lignes vives, fort près de la surface. */
  vec2 cp = q * vec2(5.0, 7.0);
  for (int i = 0; i < 3; i++) cp += vec2(sin(cp.y * 1.3 + t * 0.6), cos(cp.x * 1.1 - t * 0.5)) * 0.55;
  float caust = smoothstep(0.16, 0.0, abs(sin(cp.x) * sin(cp.y)));
  col = mix(col, mix(ACC, PAPER, 0.35), caust * (1.0 - smoothstep(0.0, 0.7, q.y)) * 0.6);

  /* Bulles. */
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    float sp = 0.06 + 0.06 * h1(fi + 11.0) + 0.25 * clamp(uParam1, 0.0, 1.0);
    vec2 bp = vec2(A * h1(fi + 4.0) + 0.02 * sin(t * 2.0 + fi), 1.05 - fract(t * sp + h1(fi + 9.0)) * 1.2);
    float br = 0.006 + 0.01 * h1(fi + 2.0);
    float d = abs(length(q - bp) - br) - 1.1 * PX;
    col = mix(col, dark ? INK : PAPER, fill(d) * 0.85);
  }

  /* Algues : silhouettes qui ondulent. */
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float x0 = A * (0.06 + 0.17 * fi + 0.05 * h1(fi + 21.0));
    float top = 0.52 + 0.18 * h1(fi + 5.0);
    if (q.y > top && q.y < 0.95) {
      float k = (q.y - top) / (0.95 - top);
      float x = x0 + 0.035 * sin(q.y * 14.0 - t * 1.4 + fi) * (1.0 - k);
      float w = mix(0.003, 0.011, k);
      col = mix(col, INK, fill(abs(q.x - x) - w) * (dark ? 0.55 : 0.75));
    }
  }

  /* Sable. */
  float floorY = 0.88 + 0.018 * sin(q.x * 7.0) + 0.008 * sin(q.x * 23.0 + 1.0);
  vec3 sand = mix(FISH2, PAPER, 0.4);
  col = mix(col, INK, fill(floorY - q.y + 2.4 * PX));
  col = mix(col, sand, fill(floorY - q.y));
  if (q.y > floorY + 0.01) {
    vec2 gs = mod(f, 6.0) - 3.0;
    col = mix(col, INK, (1.0 - smoothstep(0.6, 1.4, length(gs))) * 0.25);
  }

  /* La page : contour tracé par le banc (étape 2), puis posée et publiée (étape 3). */
  vec2 cc = cardCenter(A), ch = cardHalf(A);
  float showCard = smoothstep(0.38, 0.52, p);
  if (showCard > 0.0) {
    float d = sdBox(q - cc, ch, 0.02);
    float pub = publishK();
    vec2 sh = vec2(0.012, 0.014) * pub;
    col = mix(col, ACC, fill(sdBox(q - cc - sh, ch, 0.02)) * pub);
    float dash = step(0.5, fract((q.x + q.y) * 34.0 - t * 0.6));
    float edge = fill(abs(d) - 1.4 * PX) * mix(dash, 1.0, pub);
    col = mix(col, mix(col, CARD, 0.92), fill(d) * pub);
    col = mix(col, INK, edge * showCard);
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float on = smoothstep(0.46 + fi * 0.05, 0.52 + fi * 0.05, p);
      float y = cc.y - ch.y * 0.35 + fi * ch.y * 0.42;
      float w = ch.x * (fi == 0.0 ? 0.7 : 0.55 - fi * 0.08);
      float bar = sdBox(q - vec2(cc.x - ch.x * 0.62 + w * on * 0.5 + 0.02, y), vec2(w * on * 0.5, 0.012), 0.012);
      col = mix(col, fi == 0.0 ? INK : mix(INK, CARD, 0.45), fill(bar) * on * showCard);
    }
    float img = sdBox(q - vec2(cc.x + ch.x * 0.55, cc.y + ch.y * 0.15), vec2(ch.x * 0.24, ch.y * 0.42), 0.015);
    layer(col, FISH1, img + (1.0 - smoothstep(0.55, 0.62, p)) * 0.2, 1.8 * PX);
    /* Le lien. */
    if (pub > 0.0) {
      vec2 lc = vec2(cc.x, cc.y + ch.y + 0.07 - 0.03 * (1.0 - pub));
      float pill = sdBox(q - lc, vec2(0.13 * pub + 0.001, 0.028), 0.028);
      layer(col, ACC, pill, 2.2 * PX);
      col = mix(col, INK, fill(sdBox(q - lc - vec2(0.02, 0.0), vec2(0.07 * pub, 0.006), 0.006)));
      col = mix(col, INK, fill(abs(length(q - lc + vec2(0.085, 0.0)) - 0.012) - 1.6 * PX) * pub);
    }
  }

  /* Le banc. */
  for (int i = 0; i < N; i++) drawFish(col, q, i, A, t);

  /* La bulle-idée tombe (étape 1) puis éclate en page. */
  float drop = smoothstep(0.0, 0.3, p);
  float burst = smoothstep(0.3, 0.42, p);
  if (burst < 1.0) {
    vec2 bc = vec2(cardCenter(A).x + 0.02 * sin(t * 1.5), mix(-0.12, cardCenter(A).y, drop) + 0.01 * sin(t * 2.0));
    float br = 0.075 * (1.0 + burst * 1.6);
    float d = length(q - bc) - br;
    float a = 1.0 - burst;
    vec3 c0 = col;
    layer(col, ACC, d, 2.6 * PX);
    col = mix(col, PAPER, fill(length(q - bc - vec2(-0.025, -0.028)) - 0.014));
    vec2 sp = q - bc;
    float star = min(sdSeg(sp, vec2(0.0, -0.028), vec2(0.0, 0.028)), sdSeg(sp, vec2(-0.028, 0.0), vec2(0.028, 0.0))) - 0.006;
    star = min(star, min(sdSeg(sp, vec2(-0.017, -0.017), vec2(0.017, 0.017)), sdSeg(sp, vec2(-0.017, 0.017), vec2(0.017, -0.017))) - 0.004);
    col = mix(col, INK, fill(star));
    col = mix(c0, col, a);
  }

  o = vec4(col, 1.0);
}
`;

const step = (n: number, title: string, text: string) => ({
  tagName: "div",
  attributes: {
    id: `aq-etape-${n}`,
    style:
      "position:absolute;left:clamp(1rem,6vw,5rem);top:max(9rem,calc(100dvh - 21rem));width:min(23rem,calc(100vw - 2rem));box-sizing:border-box;padding:1.1rem 1.25rem 1.2rem;display:grid;grid-template-columns:auto 1fr;gap:.2rem .9rem;align-items:start;background:var(--sc-base);color:var(--sc-base-content);border:2px solid var(--sc-base-content);border-radius:1.25rem;box-shadow:6px 6px 0 var(--sc-accent, var(--sc-primary));opacity:0;will-change:transform,opacity",
  },
  nodes: [
    {
      tagName: "span",
      attributes: {
        style:
          "grid-row:span 2;display:grid;place-items:center;width:3rem;height:2.8rem;border:2px solid var(--sc-base-content);border-radius:58% 42% 55% 45% / 46% 56% 44% 54%;background:var(--sc-accent, var(--sc-primary));color:var(--sc-accent-content, var(--sc-primary-content));font-family:'Instrument Serif',Georgia,serif;font-style:italic;font-size:2rem;line-height:1;transform:rotate(-8deg)",
      },
      textContent: String(n),
    },
    {
      tagName: "strong",
      attributes: {
        style:
          "font-family:var(--sc-font-family-headings, inherit);font-size:1.35rem;line-height:1.1;font-weight:800;letter-spacing:-0.02em;text-transform:uppercase",
      },
      textContent: title,
    },
    {tagName: "span", attributes: {style: "font-size:.95rem;line-height:1.45"}, textContent: text},
  ],
});

/** Cartes d'étape : une timeline lue sur l'avancement épinglé (0..1), publiée en nœuds pour `sonic-stage`. */
const fade = (id: string, at: number, from: number, to: number) => ({
  type: "tween",
  targets: [id],
  props: {opacity: [from, to], y: [from ? 0 : 28, from ? -16 : 0]},
  delay: at,
  duration: 0.06,
  ease: "easeOut",
});
const STEPS_TIMELINE = JSON.stringify({
  duration: 1,
  root: {
    type: "par",
    nodes: [
      fade("aq-etape-1", 0.26, 1, 0),
      fade("aq-etape-2", 0.36, 0, 1),
      fade("aq-etape-2", 0.58, 1, 0),
      fade("aq-etape-3", 0.68, 0, 1),
    ],
  },
});

export const LANDING_AQUARIUM_DOC: Record<string, unknown> = {
  schema: "artifacts/1",
  title: "Comment ça marche",
  theme: "default",
  defaultView: "aquarium",
  page: {padding: "none"},
  views: [
    {
      id: "aquarium",
      title: "Aquarium",
      root: {
        nodes: [
          {
            tagName: "sonic-scroll",
            attributes: {
              sections: "#aquarium",
              smooth: "0.12",
              map: "param0=sections.0.pin; param1=min(abs(velocity)/2500, 1)",
              "out-data-provider": "aqDefil",
            },
          },
          {
            tagName: "sonic-cursor",
            attributes: {
              smooth: "0.15",
              map: "param2=inside && !touch ? nx : -1; param3=ny",
              "out-data-provider": "aqPointeur",
            },
          },
          {
            tagName: "sonic-timeline",
            attributes: {descriptor: STEPS_TIMELINE, "time-source": "aqDefil.param0", "nodes-out": "aqEtapes"},
          },
          {
            tagName: "section",
            attributes: {id: "aquarium", "aria-label": "Comment ça marche", style: "position:relative;height:340vh"},
            nodes: [
              {
                tagName: "div",
                attributes: {style: "position:sticky;top:0;height:100vh;height:100dvh;overflow:hidden"},
                nodes: [
                  {
                    tagName: "sonic-shader",
                    attributes: {
                      dataProvider: "aqDefil",
                      params: "aqPointeur",
                      colors: COLORS,
                      "dpr-max": "1",
                      image: SHADER,
                      style:
                        "position:absolute;inset:0;width:100%;height:100%;aspect-ratio:auto;background:var(--sc-deco-2, var(--sc-base-50));pointer-events:none",
                    },
                  },
                  {
                    tagName: "div",
                    attributes: {
                      style:
                        "position:absolute;top:clamp(1rem,7vh,4rem);left:clamp(1rem,6vw,5rem);display:flex;align-items:center;gap:.6rem;padding:.35rem 1rem;border:2px solid var(--sc-base-content);border-radius:999px;background:var(--sc-base);color:var(--sc-base-content);font-family:var(--sc-font-family-headings, inherit);font-weight:800;font-size:clamp(1rem,2.4vw,1.4rem);text-transform:uppercase;letter-spacing:-0.01em;transform:rotate(-2deg);box-shadow:4px 4px 0 var(--sc-base-content)",
                    },
                    nodes: [
                      {tagName: "span", textContent: "Comment ça"},
                      {
                        tagName: "span",
                        attributes: {
                          style:
                            "padding:0 .35em;border-radius:.3em;background:var(--sc-accent, var(--sc-primary));color:var(--sc-accent-content, var(--sc-primary-content));font-family:'Instrument Serif',Georgia,serif;font-style:italic;font-weight:400;text-transform:none;font-size:1.15em",
                        },
                        textContent: "marche",
                      },
                    ],
                  },
                  {
                    tagName: "sonic-stage",
                    attributes: {dataProvider: "aqEtapes", style: "position:absolute;inset:0;pointer-events:none"},
                    nodes: [
                      step(1, "Vous décrivez", "Une idée, une phrase : un quiz sur les châteaux, un petit jeu, un instrument."),
                      step(
                        2,
                        "L’assistant fabrique",
                        "Il assemble la page avec les briques d’Artefacts : formulaires, son, physique, 3D, shaders.",
                      ),
                      step(3, "C’est en ligne", "Un lien à partager, ou une balise à coller sur votre site."),
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  ],
};
