import "@ladigitale/agent-stack/chat";
import "@supersoniks/concorde/button";
import {html, LitElement, nothing} from "lit";
import {customElement, property, state} from "lit/decorators.js";
import tailwind from "../../css/tailwind";
import {fetchAgentSettingsStatus, getArtifact, tadaaaAssistantSettingsUrl} from "../cloud/client";
import {getApiRoot, loadArtifactsAccount} from "../cloud/account";
import {navigate} from "../navigate";
import "./artifact-viewer";
import {atelierToolLabels} from "../atelier-tool-labels";

/**
 * Atelier : création / modification d'un artefact en conversation avec l'agent de
 * Tadaaa (profil `artifacts`). Le chat à gauche, l'aperçu à droite : l'agent envoie
 * chaque version du document par `preview_artifact` (événement `artifact-preview`),
 * rendue par le vrai viewer en mode aperçu. La publication reste une action de l'agent,
 * après confirmation dans le chat.
 */
const KITS_KEY = "artifacts-atelier-kits";

function readUseKits(): boolean {
  try {
    return localStorage.getItem(KITS_KEY) !== "0";
  } catch {
    return true;
  }
}

@customElement("artifact-atelier-page")
export class ArtifactAtelierPage extends LitElement {
  static styles = [tailwind];

  /** Artefact à modifier (vide : création). */
  @property({type: String}) slug = "";

  @state() private preview: Record<string, unknown> | null = null;
  @state() private previewVersion = 0;
  @state() private error = "";
  /** Kits de l'agent (quiz, jeux, shader…) : décochés, l'agent compose tout librement. */
  @state() private useKits = readUseKits();
  /** Dernière publication faite par l'agent dans cette conversation (`publish_preview`). */
  @state() private published: {slug: string; url?: string; version?: number} | null = null;
  /** null : inconnu (API ancienne ou hors ligne) — on n'affiche alors rien. */
  @state() private agentReady: boolean | null = null;
  /** Objets stables : le chat les relit à chaque run. */
  private chatHeaders: Record<string, string> = {};
  private chatContext: Record<string, unknown> = {};

  connectedCallback() {
    super.connectedCallback();
    if (this.slug) void this.loadCurrent();
    void this.checkAgent();
  }

  /** Assistant pas encore configuré dans Tadaaa : on le dit avant la première question. */
  private async checkAgent() {
    if (!loadArtifactsAccount()) return;
    try {
      const s = await fetchAgentSettingsStatus();
      this.agentReady = s.configured || s.serverKeyAvailable;
    } catch {
      this.agentReady = null;
    }
  }

  /** Un run a échoué faute de configuration (réglages supprimés entre-temps). */
  private onRunError = (e: Event) => {
    if ((e as CustomEvent<{code?: string}>).detail?.code === "AGENT_NOT_CONFIGURED") this.agentReady = false;
  };

  private renderAgentBanner() {
    if (this.agentReady !== false) return nothing;
    return html`<div
      class="rounded-lg border border-amber-600/30 bg-amber-50 text-amber-950 p-3 text-sm flex flex-wrap items-center gap-2"
      role="status"
      data-agent-not-configured
    >
      <span>L’assistant n’est pas encore configuré : choisis un fournisseur et ta clé API dans Tadaaa.</span>
      <a class="underline font-medium" href=${tadaaaAssistantSettingsUrl()} target="_blank" rel="noopener">Configurer l’assistant</a>
      <sonic-button size="xs" variant="ghost" @click=${() => void this.checkAgent()}>J’ai configuré, vérifier</sonic-button>
    </div>`;
  }

  /** En modification, l'aperçu part de la version publiée. */
  private async loadCurrent() {
    try {
      const a = await getArtifact(this.slug);
      if (a.document) this.showPreview(a.document);
    } catch {
      /* l'agent relira l'artefact lui-même */
    }
  }

  private showPreview(document: Record<string, unknown>) {
    // Nouvel objet à chaque fois : le viewer recharge l'aperçu.
    this.preview = structuredClone(document);
    this.previewVersion += 1;
  }

  private setUseKits(value: boolean) {
    this.useKits = value;
    try {
      localStorage.setItem(KITS_KEY, value ? "1" : "0");
    } catch {
      /* préférence non mémorisée */
    }
  }

  private onCustom = (e: Event) => {
    const {name, value} = (e as CustomEvent<{name: string; value: unknown}>).detail;
    if (name === "artifact-published") {
      const v = value as {slug?: unknown; url?: unknown; version?: unknown};
      if (typeof v?.slug === "string") {
        this.published = {
          slug: v.slug,
          url: typeof v.url === "string" ? v.url : undefined,
          version: typeof v.version === "number" ? v.version : undefined,
        };
      }
      return;
    }
    if (name !== "artifact-preview") return;
    const document = (value as {document?: unknown})?.document;
    if (document && typeof document === "object") this.showPreview(document as Record<string, unknown>);
  };

  render() {
    const account = loadArtifactsAccount();
    if (!account) {
      return html`<p class="p-4">Connectez-vous pour utiliser l’atelier.</p>`;
    }
    const endpoint = `${getApiRoot(account)}/agent/artifacts/run`;
    this.chatHeaders.Authorization = `Bearer ${account.token}`;
    if (this.slug) this.chatContext.artifact = {slug: this.slug};
    this.chatContext.atelier = {kits: this.useKits};
    return html`
      <div class="flex flex-col gap-3 p-3 sm:p-4 h-full min-h-[32rem] box-border">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 class="text-2xl font-semibold m-0">Atelier</h1>
            <p class="opacity-70 m-0 text-sm">
              ${this.slug ? html`Modification de <code>${this.slug}</code>` : "Décrivez l’artefact à créer."}
            </p>
          </div>
          <label class="flex items-center gap-2 text-sm cursor-pointer select-none" title="Décoché : l’agent compose tout librement, sans partir des kits (quiz, jeux, shader, page, sondage).">
            <input
              type="checkbox"
              data-kits-toggle
              .checked=${this.useKits}
              @change=${(e: Event) => this.setUseKits((e.target as HTMLInputElement).checked)}
            />
            Partir des kits quand c’est possible
          </label>
          ${this.published && this.published.slug !== this.slug
            ? html`<sonic-button size="sm" type="primary" data-published href=${this.published.url ?? `/${this.published.slug}`} target="_blank"
                >Publié : ${this.published.slug}${this.published.version ? ` (v${this.published.version})` : ""}</sonic-button
              >`
            : this.slug
              ? html`<sonic-button size="sm" variant="outline" @click=${() => navigate(`/${this.slug}/`)}
                  >Voir la page${this.published?.version ? ` (v${this.published.version})` : ""}</sonic-button
                >`
              : nothing}
        </div>
        ${this.error ? html`<p class="text-red-600 m-0">${this.error}</p>` : nothing}
        ${this.renderAgentBanner()}
        <div class="grid gap-3 flex-1 min-h-0 grid-cols-1 lg:grid-cols-[minmax(20rem,26rem)_1fr]">
          <sonic-chat
            class="min-h-[20rem] lg:min-h-0 rounded-lg border border-black/10 p-3"
            endpoint=${endpoint}
            placeholder=${this.slug ? "Que faut-il changer ?" : "Ex. : un quiz de 5 questions sur les châteaux de la Loire"}
            .headers=${this.chatHeaders}
            .forwardedProps=${this.chatContext}
            .toolLabels=${atelierToolLabels}
            @chat-custom=${this.onCustom}
            @chat-run-error=${this.onRunError}
          ></sonic-chat>
          <section
            class="min-h-[20rem] lg:min-h-0 overflow-auto rounded-lg border border-black/10"
            aria-label="Aperçu"
          >
            ${this.preview
              ? html`<artifact-viewer
                  embedded
                  slug=${this.slug || "atelier"}
                  .previewDocument=${this.preview}
                  data-version=${this.previewVersion}
                ></artifact-viewer>`
              : html`<p class="p-4 opacity-70 m-0">L’aperçu apparaîtra ici dès que l’agent aura une première version.</p>`}
          </section>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "artifact-atelier-page": ArtifactAtelierPage;
  }
}
