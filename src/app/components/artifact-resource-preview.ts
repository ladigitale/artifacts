import {css, html, LitElement, nothing, svg, type PropertyValues} from "lit";
import {customElement, property, state} from "lit/decorators.js";
import {dp} from "@supersoniks/concorde/utils";
import {ensureAddonsFor} from "../addons";
import type {ResourceSummary} from "../cloud/client";
import {
  audioPeaks,
  loadPreview,
  loadThumb,
  PREVIEW_PARAMS_DP,
  previewKey,
  testImageUrl,
  type ResourcePreview,
  type ResourceThumb,
} from "../resource-preview";
import {uiStyles} from "../styles/ui";

const GLYPHS: Record<string, string> = {shader: "ƒ", model3d: "3D", data: "{ }", image: "▦", audio: "♪"};

function waveform(peaks: number[]) {
  const w = 3;
  return html`<svg class="wave" viewBox="0 0 ${peaks.length * w} 40" preserveAspectRatio="none" aria-hidden="true">
    ${peaks.map((p, i) => {
      const h = Math.max(2, p * 38);
      return svg`<rect x=${i * w + 0.5} y=${20 - h / 2} width=${w - 1} height=${h} rx="0.8"></rect>`;
    })}
  </svg>`;
}

/**
 * Miniature d'une ressource dans la liste : l'image, une image du shader ou du modèle 3D, la forme d'onde
 * d'un son. Rien n'est lu tant que la ligne n'approche pas de l'écran.
 */
@customElement("artifact-resource-thumb")
export class ArtifactResourceThumb extends LitElement {
  static styles = [
    uiStyles,
    css`
      :host {
        display: block;
        width: 4.5rem;
        aspect-ratio: 3 / 2;
        flex: none;
        border-radius: calc(var(--ui-radius) * 0.75);
        overflow: hidden;
        background: var(--ui-hover);
        color: var(--ui-muted);
      }
      .box {
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
        font-size: var(--ui-fs-sm);
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .wave {
        width: 86%;
        height: 70%;
        fill: var(--sc-primary, currentColor);
      }
      .pending {
        animation: pulse 1.2s ease-in-out infinite alternate;
      }
      @keyframes pulse {
        to {
          opacity: 0.45;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .pending {
          animation: none;
        }
      }
    `,
  ];

  @property({attribute: false}) resource: ResourceSummary | null = null;
  @state() private thumb: ResourceThumb | null = null;
  @state() private pending = false;

  private observer: IntersectionObserver | null = null;
  private key = "";
  private seen = false;
  private seq = 0;

  connectedCallback() {
    super.connectedCallback();
    this.observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        this.seen = true;
        this.observer?.disconnect();
        void this.load();
      },
      {rootMargin: "200px"},
    );
    this.observer.observe(this);
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    this.observer = null;
    super.disconnectedCallback();
  }

  protected willUpdate(changed: PropertyValues) {
    if (!changed.has("resource")) return;
    const key = this.resource ? previewKey(this.resource) : "";
    if (key === this.key) return; // liste rechargée : même contenu, la miniature reste
    this.key = key;
    this.thumb = null;
    if (this.seen) void this.load();
  }

  private async load() {
    const r = this.resource;
    if (!r) return;
    const seq = ++this.seq;
    this.pending = true;
    try {
      const thumb = await loadThumb(r);
      if (seq === this.seq) this.thumb = thumb;
    } catch {
      if (seq === this.seq) this.thumb = {type: "none"};
    } finally {
      if (seq === this.seq) this.pending = false;
    }
  }

  render() {
    const t = this.thumb;
    if (t?.type === "image") return html`<img src=${t.url} alt="" loading="lazy" decoding="async" />`;
    if (t?.type === "wave" && t.peaks.length) return html`<div class="box">${waveform(t.peaks)}</div>`;
    const kind = this.resource?.kind ?? "";
    return html`<div class="box ${this.pending ? "pending" : ""}" aria-hidden="true">${GLYPHS[kind] ?? "·"}</div>`;
  }
}

/**
 * Aperçu d'une ressource en grand : shader vivant avec ses réglages, modèle 3D à faire tourner, image,
 * son à écouter, données en texte.
 */
@customElement("artifact-resource-preview")
export class ArtifactResourcePreview extends LitElement {
  static styles = [
    uiStyles,
    css`
      :host {
        display: block;
      }
      .frame {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 10;
        max-height: 55vh;
        border-radius: var(--ui-radius);
        overflow: hidden;
        background: var(--ui-hover);
        display: grid;
        place-items: center;
      }
      .frame > sonic-shader,
      .frame > sonic-3d {
        display: block;
        width: 100%;
        height: 100%;
      }
      .frame.image {
        /* Damier : laisse voir la transparence d'une image. */
        background:
          repeating-conic-gradient(var(--ui-hover) 0% 25%, transparent 0% 50%) 50% / 1.25rem 1.25rem,
          var(--sc-base);
      }
      .frame img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        display: block;
      }
      .frame.audio {
        aspect-ratio: auto;
        padding: var(--ui-4);
        gap: var(--ui-3);
      }
      .wave {
        width: 100%;
        height: 5rem;
        fill: var(--sc-primary, currentColor);
      }
      audio {
        width: 100%;
      }
      .sliders {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
        gap: var(--ui-2) var(--ui-4);
        margin-top: var(--ui-3);
      }
      .notice {
        margin-top: var(--ui-3);
      }
      pre {
        margin: 0;
        max-height: 55vh;
        overflow: auto;
        padding: var(--ui-3);
        border: 1px solid var(--ui-line);
        border-radius: var(--ui-radius);
        font-size: var(--ui-fs-xs);
        white-space: pre-wrap;
        word-break: break-word;
      }
      .wait {
        color: var(--ui-muted);
        font-size: var(--ui-fs-sm);
      }
    `,
  ];

  @property({attribute: false}) resource: ResourceSummary | null = null;
  @state() private preview: ResourcePreview | null = null;
  @state() private failed = "";
  @state() private renderError = "";
  @state() private channel = "";
  @state() private peaks: number[] = [];

  private seq = 0;
  private key = "";

  protected willUpdate(changed: PropertyValues) {
    if (!changed.has("resource")) return;
    const key = this.resource ? previewKey(this.resource) : "";
    if (key === this.key) return; // fiche relue : même contenu, l'aperçu en cours reste
    this.key = key;
    void this.load();
  }

  private async load() {
    const seq = ++this.seq;
    const r = this.resource;
    this.preview = null;
    this.failed = "";
    this.renderError = "";
    this.channel = "";
    this.peaks = [];
    if (!r) return;
    try {
      const p = await loadPreview(r);
      if (seq !== this.seq) return;
      if (p.type === "shader") {
        // Les réglages repartent des valeurs par défaut du shader ; les curseurs écrivent dans ce DataProvider.
        dp(PREVIEW_PARAMS_DP).set(Object.fromEntries(p.params.map((x) => [`param${x.index}`, x.value])));
        const [url] = await Promise.all([p.needsImage ? testImageUrl() : "", ensureAddonsFor({tagName: "sonic-shader"})]);
        if (seq !== this.seq) return;
        this.channel = url;
      } else if (p.type === "model") {
        await ensureAddonsFor({tagName: "sonic-3d"});
        if (seq !== this.seq) return;
      } else if (p.type === "audio") {
        void audioPeaks(p.blob, 96).then(
          (peaks) => seq === this.seq && (this.peaks = peaks),
          () => {},
        );
      }
      this.preview = p;
    } catch (e) {
      if (seq === this.seq) this.failed = e instanceof Error && e.message ? e.message : "Contenu illisible.";
    }
  }

  private onShaderState(e: Event) {
    const s = (e as CustomEvent).detail as {status?: string; error?: string | null};
    this.renderError = s?.status === "error" ? (s.error ?? "Le shader ne compile pas.") : "";
  }

  private on3dError(e: Event) {
    this.renderError = String((e as CustomEvent).detail?.message ?? "Modèle illisible.");
  }

  private renderBody(p: ResourcePreview) {
    switch (p.type) {
      case "shader":
        return html`
          <div class="frame">
            <sonic-shader
              params=${PREVIEW_PARAMS_DP}
              .image=${p.source}
              .channel0=${this.channel}
              aspect-ratio="16 / 10"
              @shader-state=${(e: Event) => this.onShaderState(e)}
            ></sonic-shader>
          </div>
          ${p.params.length
            ? html`<div class="sliders">
                ${p.params.map(
                  (x) =>
                    html`<sonic-slider
                      formDataProvider=${PREVIEW_PARAMS_DP}
                      name="param${x.index}"
                      label=${x.label}
                      .min=${x.min}
                      .max=${x.max}
                      .step=${x.step}
                      .value=${x.value}
                    ></sonic-slider>`,
                )}
              </div>`
            : nothing}
        `;
      case "model":
        return html`<div class="frame">
          <sonic-3d camera="orbit" auto-rotate gestures="capture" .asset=${p.asset} @error=${(e: Event) => this.on3dError(e)}></sonic-3d>
        </div>`;
      case "image":
        return html`<div class="frame image"><img src=${p.url} alt=${this.resource?.name ?? ""} /></div>`;
      case "audio":
        return html`<div class="frame audio">
          ${this.peaks.length ? waveform(this.peaks) : nothing}
          <audio controls preload="metadata" src=${p.url}></audio>
        </div>`;
      case "text":
        return html`<pre>${p.text}${p.truncated ? "\n… (tronqué)" : ""}</pre>`;
      default:
        return html`<div class="frame"><p class="wait">Ce format n’a pas d’aperçu. Téléchargez le fichier pour l’ouvrir.</p></div>`;
    }
  }

  render() {
    if (this.failed) return html`<div class="notice" data-tone="danger" role="alert">${this.failed}</div>`;
    if (!this.preview) return html`<div class="frame"><p class="wait" aria-live="polite">Chargement de l’aperçu…</p></div>`;
    return html`
      ${this.renderBody(this.preview)}
      ${this.renderError ? html`<div class="notice" data-tone="danger" role="alert">${this.renderError}</div>` : nothing}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "artifact-resource-thumb": ArtifactResourceThumb;
    "artifact-resource-preview": ArtifactResourcePreview;
  }
}
