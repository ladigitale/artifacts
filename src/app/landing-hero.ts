/**
 * Scène d'accueil : un document d'artefact comme les autres, rendu par le viewer.
 * `sonic-physics` simule (corps transparents : son canvas ne sert qu'à attraper les gestes), `sonic-stage` place des éléments HTML sur les corps,
 * `sonic-sound` joue un « toc » aux chocs une fois le son déverrouillé par un geste.
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
  ink: "background:var(--sc-base-content);color:var(--sc-base)",
  primary: "background:var(--sc-primary);color:var(--sc-primary-content)",
  paper: "background:var(--sc-base);color:var(--sc-base-content);border:1.5px solid var(--sc-base-content)",
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
    style: `width:${t.w}px;height:${t.h}px;box-sizing:border-box;display:grid;place-items:center;border-radius:${t.round ? "50%" : "6px"};font-weight:700;font-size:${t.name === "idee" ? 24 : 18}px;letter-spacing:-0.01em;user-select:none;${LOOKS[t.look]}`,
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
              initial: '{"sound": {"play": {"toc": 0}}}',
              reducer:
                '$action.type = "collide" ? $merge([$state, {"sound": {"play": {"toc": $state.sound.play.toc + 1}}}]) : $state',
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
            ],
          },
        ],
      },
    },
  ],
};
