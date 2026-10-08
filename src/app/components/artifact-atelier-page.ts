import "@ladigitale/agent-stack/chat";
import "@supersoniks/concorde/button";
import {html, LitElement, nothing} from "lit";
import {customElement, property, state} from "lit/decorators.js";
import tailwind from "../../css/tailwind";
import {getArtifact} from "../cloud/client";
import {getApiRoot, loadArtifactsAccount} from "../cloud/account";
import {navigate} from "../navigate";
import "./artifact-viewer";

/**
 * Atelier : création / modification d'un artefact en conversation avec l'agent de
 * Tadaaa (profil `artifacts`). Le chat à gauche, l'aperçu à droite : l'agent envoie
 * chaque version du document par `preview_artifact` (événement `artifact-preview`),
 * rendue par le vrai viewer en mode aperçu. La publication reste une action de l'agent,
 * après confirmation dans le chat.
 */
@customElement("artifact-atelier-page")
export class ArtifactAtelierPage extends LitElement {
  static styles = [tailwind];

  /** Artefact à modifier (vide : création). */
  @property({type: String}) slug = "";

  @state() private preview: Record<string, unknown> | null = null;
  @state() private previewVersion = 0;
  @state() private error = "";
  /** Objets stables : le chat les relit à chaque run. */
  private chatHeaders: Record<string, string> = {};
  private chatContext: Record<string, unknown> = {};

  connectedCallback() {
    super.connectedCallback();
    if (this.slug) void this.loadCurrent();
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

  private onCustom = (e: Event) => {
    const {name, value} = (e as CustomEvent<{name: string; value: unknown}>).detail;
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
    return html`
      <div class="flex flex-col gap-3 p-3 sm:p-4 h-[calc(100dvh-4rem)] min-h-[32rem]">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 class="text-2xl font-semibold m-0">Atelier</h1>
            <p class="opacity-70 m-0 text-sm">
              ${this.slug ? html`Modification de <code>${this.slug}</code>` : "Décrivez l’artefact à créer."}
            </p>
          </div>
          ${this.slug
            ? html`<sonic-button size="sm" variant="outline" @click=${() => navigate(`/${this.slug}/`)}>Voir la page</sonic-button>`
            : nothing}
        </div>
        ${this.error ? html`<p class="text-red-600 m-0">${this.error}</p>` : nothing}
        <div class="grid gap-3 flex-1 min-h-0 grid-cols-1 lg:grid-cols-[minmax(20rem,26rem)_1fr]">
          <sonic-chat
            class="min-h-[20rem] lg:min-h-0 rounded-lg border border-black/10 p-3"
            endpoint=${endpoint}
            placeholder=${this.slug ? "Que faut-il changer ?" : "Ex. : un quiz de 5 questions sur les châteaux de la Loire"}
            .headers=${this.chatHeaders}
            .forwardedProps=${this.chatContext}
            @chat-custom=${this.onCustom}
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
