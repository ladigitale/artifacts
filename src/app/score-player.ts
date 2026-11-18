/**
 * Partition d'un flux de run (`{"type": "score"}`) jouée localement par chaque viewer.
 *
 *   {"duration": 8000, "loop": true, "speed": 1,
 *    "events": [{"at": 0, "action": "pulse", "payload": …}],
 *    "tracks": [{"path": "/hue", "keys": [{"at": 0, "value": 0.1}, {"at": 4000, "value": 0.9, "ease": "inOut"}]}]}
 *
 * Le temps de la partition part de l'heure serveur `t` du message : tous les viewers (et un
 * spectateur arrivé en cours) sont à la même position. Les pistes interpolent des nombres et des
 * couleurs `#rrggbb` (le reste change par paliers) ; les événements partent quand la position
 * franchit leur `at` (voir `play` pour ceux déjà passés à la réception).
 * Une piste peut aussi écrire le `t` lu par un `sonic-timeline` (time-source) du document.
 */
export type ScoreKey = {at: number; value: unknown; ease?: string};
export type Score = {
  duration?: number;
  loop?: boolean;
  speed?: number;
  events?: {at: number; action: string; payload?: unknown}[];
  tracks?: {path: string; keys: ScoreKey[]}[];
};

/** Durée effective : `duration`, sinon le dernier `at` (pistes et événements). */
export function scoreLength(score: Score): number {
  if (typeof score.duration === "number" && score.duration > 0) return score.duration;
  let end = 0;
  for (const e of score.events ?? []) end = Math.max(end, e.at);
  for (const t of score.tracks ?? []) for (const k of t.keys) end = Math.max(end, k.at);
  return end;
}

/** Position dans la partition (ms) à `elapsed` ms de son départ ; `done` si elle est finie (sans boucle). */
export function scorePosition(score: Score, elapsed: number): {pos: number; done: boolean; lap: number} {
  const len = scoreLength(score);
  const raw = Math.max(0, elapsed) * (typeof score.speed === "number" && score.speed > 0 ? score.speed : 1);
  if (score.loop && len > 0) return {pos: raw % len, done: false, lap: Math.floor(raw / len)};
  return {pos: Math.min(raw, len), done: raw >= len, lap: 0};
}

const EASES: Record<string, (t: number) => number> = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  step: () => 0,
};

/** Valeur d'une piste à `pos` (ms). L'`ease` d'une clé règle le trajet qui y mène. */
export function trackValue(keys: ScoreKey[], pos: number): unknown {
  if (!keys.length) return undefined;
  if (pos <= keys[0].at) return keys[0].value;
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (pos > b.at) continue;
    const a = keys[i - 1];
    const span = b.at - a.at;
    const k = span <= 0 ? 1 : (EASES[b.ease ?? "linear"] ?? EASES.linear)((pos - a.at) / span);
    return pos >= b.at ? b.value : mix(a.value, b.value, k);
  }
  return keys[keys.length - 1].value;
}

/** Événements franchis entre deux positions (bornes : `from` exclue, `to` incluse ; boucle gérée). */
export function eventsBetween(score: Score, from: number, to: number, wrapped: boolean): NonNullable<Score["events"]> {
  const events = score.events ?? [];
  if (!wrapped) return events.filter((e) => e.at > from && e.at <= to);
  const len = scoreLength(score);
  return [...events.filter((e) => e.at > from && e.at <= len), ...events.filter((e) => e.at >= 0 && e.at <= to)];
}

function mix(a: unknown, b: unknown, k: number): unknown {
  if (typeof a === "number" && typeof b === "number") return a + (b - a) * k;
  const ca = typeof a === "string" ? hex(a) : null;
  const cb = typeof b === "string" ? hex(b) : null;
  if (ca && cb) {
    const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * k));
    return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  return k >= 1 ? b : a;
}

function hex(s: string): number[] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(s.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export type ScorePlayerOptions = {
  /** Heure serveur actuelle (ms). */
  now: () => number;
  /** Écrit les valeurs des pistes (pointeur → valeur), une fois par image au plus. */
  write: (values: {path: string; value: unknown}[]) => void;
  /** Déclenche une action de la partition. */
  dispatch: (action: string, payload: unknown) => void;
  /** Cadence max d'écriture des pistes (Hz). */
  rate?: number;
};

/** Lecteur : une partition à la fois ; `play` remplace la précédente. */
export class ScorePlayer {
  private score: Score | null = null;
  private start = 0;
  private lastPos = -1;
  private lastLap = 0;
  private lastWrite = 0;
  private lastJson = "";
  private raf = 0;
  private timer = 0;

  constructor(private readonly opts: ScorePlayerOptions) {}

  /**
   * `startedAt` : heure serveur du message `score`. `live` : partition reçue en direct (même avec
   * un peu de retard, relecture comprise) : les événements du tour en cours déjà passés partent ;
   * sinon (spectateur arrivé en cours, rechargement : l'instantané d'état les contient) rien n'est rattrapé.
   */
  play(score: Score, startedAt: number, live = false): void {
    this.stop();
    this.score = score;
    this.start = startedAt;
    const elapsed = this.opts.now() - startedAt;
    const {pos, lap} = scorePosition(score, elapsed);
    this.lastPos = live || elapsed < 500 ? -1 : pos;
    this.lastLap = lap;
    this.lastJson = "";
    this.frame();
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.timer) clearTimeout(this.timer);
    this.raf = 0;
    this.timer = 0;
    this.score = null;
  }

  get playing(): boolean {
    return this.score !== null;
  }

  private schedule(): void {
    // Onglet caché : requestAnimationFrame s'arrête, une minuterie lente garde les événements à l'heure.
    if (typeof document !== "undefined" && document.hidden) this.timer = window.setTimeout(() => this.frame(), 250);
    else this.raf = requestAnimationFrame(() => this.frame());
  }

  private frame(): void {
    this.raf = 0;
    this.timer = 0;
    const score = this.score;
    if (!score) return;
    const {pos, done, lap} = scorePosition(score, this.opts.now() - this.start);
    const wrapped = lap > this.lastLap;
    if (pos !== this.lastPos || wrapped) {
      for (const e of eventsBetween(score, this.lastPos, pos, wrapped)) this.opts.dispatch(e.action, e.payload);
    }
    this.lastPos = pos;
    this.lastLap = lap;
    const t = performance.now();
    const minGap = 1000 / Math.max(1, Math.min(60, this.opts.rate ?? 30));
    if (score.tracks?.length && (done || t - this.lastWrite >= minGap)) {
      const values = score.tracks.map((tr) => ({path: tr.path, value: trackValue(tr.keys, pos)}));
      const json = JSON.stringify(values);
      if (json !== this.lastJson) {
        this.lastJson = json;
        this.lastWrite = t;
        this.opts.write(values);
      }
    }
    if (done) {
      this.score = null;
      return;
    }
    this.schedule();
  }
}
