/**
 * Scène d'accueil : un document d'artefact comme les autres, rendu par le viewer.
 * `sonic-physics` simule (corps transparents : son canvas ne sert qu'à attraper les gestes), `sonic-stage` place des éléments HTML sur les corps,
 * `sonic-sound` joue un « toc » aux chocs une fois le son déverrouillé par un geste.
 * Le petit bouton ↕ inverse la gravité : une des choses à découvrir sur la page.
 * Aucun JavaScript propre à la page : c'est la démonstration.
 */
const W = 560;
const H = 460;

type Tile = {name: string; label: string; w: number; h: number; x: number; y: number; angle: number; look: "ink" | "primary" | "paper"; round?: boolean};

const TILES: Tile[] = [
  {name: "idee", label: "votre idée", w: 220, h: 68, x: 300, y: 60, angle: -8, look: "primary"},
  {name: "quiz", label: "quiz", w: 110, h: 54, x: 120, y: 40, angle: 12, look: "ink"},
  {name: "jeu", label: "jeu", w: 92, h: 54, x: 470, y: 150, angle: -14, look: "paper"},
  {name: "instrument", label: "instrument", w: 190, h: 54, x: 160, y: 170, angle: 6, look: "paper"},
  {name: "carte", label: "carte", w: 116, h: 54, x: 400, y: 250, angle: 18, look: "ink"},
  {name: "dessin", label: "dessin", w: 128, h: 54, x: 110, y: 290, angle: -10, look: "primary"},
  {name: "sondage", label: "sondage", w: 150, h: 54, x: 300, y: 330, angle: 4, look: "paper"},
  {name: "troisd", label: "3D", w: 70, h: 70, x: 500, y: 40, angle: 0, look: "ink", round: true},
  {name: "son", label: "son", w: 64, h: 64, x: 60, y: 130, angle: 0, look: "primary", round: true},
];

const LOOKS: Record<Tile["look"], string> = {
  ink: "background:var(--art-ink, var(--sc-base-content));color:var(--art-paper, var(--sc-base))",
  primary: "background:var(--art-accent, var(--sc-primary));color:var(--art-on-accent, var(--sc-primary-content));border:1.5px solid var(--art-ink, var(--sc-base-content))",
  paper:
    "background:var(--art-card, var(--sc-base));color:var(--art-ink, var(--sc-base-content));border:1.5px solid var(--art-ink, var(--sc-base-content))",
};

const body = (t: Tile) => ({
  tagName: "sonic-body",
  attributes: {
    name: t.name,
    ...(t.round ? {shape: "circle", r: String(t.w / 2)} : {w: String(t.w), h: String(t.h)}),
    x: String(t.x),
    y: String(t.y),
    angle: String(t.angle),
    restitution: "0.42",
    friction: "0.5",
    "angular-damping": "0.6",
    fill: "transparent",
  },
});

const tile = (t: Tile) => ({
  tagName: "div",
  attributes: {
    id: t.name,
    style: `width:${t.w}px;height:${t.h}px;box-sizing:border-box;display:grid;place-items:center;border-radius:${t.round ? "50%" : "6px"};font-family:var(--art-display, inherit);font-weight:700;font-size:${t.name === "idee" ? 26 : 19}px;letter-spacing:-0.01em;user-select:none;${LOOKS[t.look]}`,
  },
  textContent: t.label,
});

export const LANDING_HERO_DOC: Record<string, unknown> = {
  schema: "artifacts/1",
  title: "Pile de mots",
  theme: "default",
  defaultView: "pile",
  page: {padding: "none"},
  views: [
    {
      id: "pile",
      title: "Pile",
      root: {
        nodes: [
          {
            tagName: "sonic-store",
            attributes: {
              id: "pile",
              "budget-ms": "50",
              // `input` part de n = 0 pour chaque corps : une impulsion ne part qu'à la hausse du compteur.
              initial: JSON.stringify({
                flips: 0,
                ctl: {gravity: [0, 9.8]},
                input: Object.fromEntries(TILES.map((t) => [t.name, {impulse: {n: 0, x: 0, y: 0}}])),
                sound: {play: {toc: 0}},
              }),
              // « flip » : la gravité s'inverse ; une petite impulsion réveille chaque corps endormi.
              reducer: `(
  $names := ${JSON.stringify(TILES.map((t) => t.name))};
  $action.type = "collide" ? $merge([$state, {"sound": {"play": {"toc": $state.sound.play.toc + 1}}}])
  : $action.type = "flip" ? (
      $n := $state.flips + 1;
      $g := $state.ctl.gravity[1] > 0 ? -9.8 : 9.8;
      $merge([$state, {"flips": $n, "ctl": {"gravity": [0, $g]}, "input": $merge($names.{$: {"impulse": {"n": $n, "x": 0, "y": $g > 0 ? 60 : -60}}})}])
    )
  : $state
)`,
            },
          },
          {
            tagName: "sonic-sound",
            attributes: {
              id: "son-pile",
              control: "pile.sound",
              bank: '{"sfx": {"toc": {"wave": "triangle", "freq": 196, "slide": -5, "dur": 0.035, "release": 0.09, "vol": 0.14, "jitter": 3, "cooldown": 90}}}',
            },
          },
          {
            tagName: "div",
            attributes: {style: `position:relative;width:100%;aspect-ratio:${W}/${H};touch-action:none`},
            nodes: [
              {
                tagName: "sonic-physics",
                attributes: {
                  id: "monde",
                  width: String(W),
                  height: String(H),
                  bounds: "walls",
                  store: "pile",
                  control: "pile.ctl",
                  input: "pile.input",
                  "collide-min": "5",
                  drag: "",
                  "nodes-plane": "screen",
                  style: "position:absolute;inset:0",
                },
                nodes: TILES.map(body),
              },
              {
                tagName: "sonic-stage",
                attributes: {
                  dataProvider: "mondeState",
                  width: String(W),
                  height: String(H),
                  style: "position:absolute;inset:0;pointer-events:none",
                },
                nodes: TILES.map(tile),
              },
              {
                tagName: "sonic-action",
                attributes: {target: "pile", type: "flip"},
                nodes: [
                  {
                    tagName: "div",
                    attributes: {
                      id: "bascule",
                      title: "Ne pas toucher",
                      style:
                        "position:absolute;top:10px;right:12px;z-index:2;width:26px;height:26px;display:grid;place-items:center;border:1.5px solid var(--art-ink, currentColor);border-radius:50%;font-size:14px;line-height:1;cursor:pointer;user-select:none;transform:rotate(12deg);background:var(--art-card, transparent);color:var(--art-ink, currentColor)",
                    },
                    textContent: "↕",
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
