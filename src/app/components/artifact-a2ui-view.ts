import {A2uiRenderer, type A2uiClientMessage, type A2uiServerMessage} from "@ladigitale/agent-stack/a2ui";
import {dispatch} from "@supersoniks/creative-stack/interactive";
import {dp, get} from "@supersoniks/concorde/utils";
import {html, LitElement, nothing, type PropertyValues} from "lit";
import {customElement, property, state} from "lit/decorators.js";

/**
 * Nom effectif de sonic-sdui dans ce bundle : le littéral est réécrit par le plugin
 * Concorde en build embed (`afx-sdui`). On en déduit le préfixe des composants.
 */
const SDUI_TAG = "sonic-sdui";
const SCOPED_PREFIX = SDUI_TAG.slice(0, -"sdui".length);
const SOURCE_PREFIX = "sonic" + "-";

function mapTag(tag: string): string {
  if (SCOPED_PREFIX === SOURCE_PREFIX || !tag.startsWith(SOURCE_PREFIX)) return tag;
  const scoped = SCOPED_PREFIX + tag.slice(SOURCE_PREFIX.length);
  return customElements.get(scoped) ? scoped : tag;
}

/**
 * Vue A2UI d'un artefact : `views[].a2ui` (messages A2UI v0.9) rendus par
 * agent-stack dans des `sonic-sdui profile="safe" partial`.
 *
 * Actions : si la vue déclare `actionStore`, un clic devient
 * `dispatch(store, {type: name, payload: {...context, surfaceId, sourceComponentId}})`.
 * Le reducer et les sinks du document font le reste.
 *
 * Retour : `a2uiBindings` (`{"/booking": "booking"}`) recopie l'état d'un DataProvider
 * du document (celui d'un store) dans le data model de chaque surface, au chemin donné,
 * à chaque changement. Les composants y lisent par `{"path": "/booking/count"}`.
 */
@customElement("artifact-a2ui-view")
export class ArtifactA2uiView extends LitElement {
  @property({attribute: false}) messages: A2uiServerMessage[] = [];
  /** Store (nom déjà préfixé par le viewer) qui reçoit les actions. */
  @property({attribute: false}) store = "";
  /** Préfixe des DataProviders des surfaces (espace de noms de l'artefact). */
  @property({attribute: false}) prefix = "a2ui_";
  /** Chemin A2UI → nom de DataProvider (déjà préfixé par le viewer). */
  @property({attribute: false}) bindings: Record<string, string> = {};

  @state() private errors: string[] = [];
  private renderer?: A2uiRenderer;
  private host?: HTMLDivElement;

  createRenderRoot() {
    return this;
  }

  private unbind: Array<() => void> = [];

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopBindings();
    this.renderer?.destroy();
    this.renderer = undefined;
  }

  private stopBindings() {
    for (const off of this.unbind) off();
    this.unbind = [];
  }

  /** Surfaces vivantes à la fin du rejeu (créées et non supprimées). */
  private liveSurfaces(): string[] {
    const live = new Set<string>();
    for (const m of this.messages ?? []) {
      if ("createSurface" in m) live.add(m.createSurface.surfaceId);
      if ("deleteSurface" in m) live.delete(m.deleteSurface.surfaceId);
    }
    return [...live];
  }

  private startBindings() {
    this.stopBindings();
    const surfaces = this.liveSurfaces();
    for (const [pointer, name] of Object.entries(this.bindings ?? {})) {
      const push = (value: unknown) => {
        for (const surfaceId of surfaces) {
          this.renderer?.handle({version: "v0.9", updateDataModel: {surfaceId, path: pointer, value: snapshot(value)}});
        }
      };
      const provider = dp(name) as {
        onAssign?: (cb: (v: unknown) => void) => void;
        offAssign?: (cb: (v: unknown) => void) => void;
      };
      provider.onAssign?.(push);
      this.unbind.push(() => provider.offAssign?.(push));
      const current = get(name) as unknown;
      if (current !== undefined) push(current);
    }
  }

  protected firstUpdated() {
    this.host = this.querySelector<HTMLDivElement>("[data-a2ui-host]") ?? undefined;
    this.replay();
  }

  protected updated(changed: PropertyValues) {
    if (
      !changed.has("errors") &&
      (changed.has("messages") || changed.has("prefix") || changed.has("bindings")) &&
      this.renderer
    ) {
      this.replay();
    }
  }

  private replay() {
    if (!this.host) return;
    this.renderer?.destroy();
    this.errors = [];
    const root = this.getRootNode();
    this.renderer = new A2uiRenderer({
      container: this.host,
      styleTarget: root instanceof ShadowRoot ? root : document,
      dataProviderPrefix: this.prefix,
      mapTag,
      onClientMessage: (msg) => this.onClientMessage(msg),
      onWarning: (w) => console.warn(`[artefacts] A2UI : ${w}`),
    });
    for (const message of this.messages ?? []) this.renderer.handle(message);
    this.startBindings();
  }

  private onClientMessage(msg: A2uiClientMessage) {
    if ("error" in msg) {
      this.errors = [...this.errors, `${msg.error.code} — ${msg.error.message}`];
      return;
    }
    const {name, context, surfaceId, sourceComponentId} = msg.action;
    if (!this.store) {
      console.warn(`[artefacts] A2UI : action "${name}" ignorée (la vue ne déclare pas actionStore).`);
      return;
    }
    dispatch(this.store, {type: name, payload: {...context, surfaceId, sourceComponentId}});
  }

  render() {
    return html`
      ${this.errors.length
        ? html`<ul class="text-sm text-red-600 m-0 mb-2" role="alert">
            ${this.errors.map((e) => html`<li>${e}</li>`)}
          </ul>`
        : nothing}
      <div data-a2ui-host class="flex flex-col gap-3"></div>
    `;
  }
}

/** Copie détachée (les DataProviders peuvent rendre des objets proxifiés). */
function snapshot(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return undefined;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "artifact-a2ui-view": ArtifactA2uiView;
  }
}
