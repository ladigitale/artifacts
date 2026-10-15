import "@ladigitale/agent-stack/chat";
import "@supersoniks/concorde/button";
import "@supersoniks/concorde/icon";
import {css, html, LitElement, nothing} from "lit";
import {customElement, property, state} from "lit/decorators.js";
import {relativeTime, fullDate, uiStyles} from "../styles/ui";
import {
  deleteAgentThread,
  fetchAgentSettingsStatus,
  getAgentThread,
  getArtifact,
  listAgentThreads,
  renameAgentThread,
  tadaaaAssistantSettingsUrl,
  type AgentThreadSummary,
} from "../cloud/client";
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

const atelierStyles = css`
  :host {
    display: block;
    height: 100%;
    overflow-y: auto;
  }
  .atelier {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--ui-3);
    height: 100%;
    min-height: 34rem;
    padding: var(--ui-3);
  }
  .bar {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-2) var(--ui-4);
  }
  .bar .titles {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .bar h1 {
    font-size: var(--ui-fs-xl);
  }
  .bar .sub {
    overflow-wrap: anywhere;
  }

  /* ───── Historique : popover ancré à la barre, jamais une ligne qui pousse la page ───── */
  .history {
    position: absolute;
    inset-block-start: calc(100% + var(--ui-2));
    inset-inline-end: 0;
    z-index: 20;
    width: min(28rem, 100%);
    max-height: min(26rem, 60vh);
    overflow-y: auto;
    background: var(--sc-base);
    border: 1px solid var(--ui-line);
    border-radius: var(--ui-radius);
    box-shadow: var(--ui-shadow-pop);
  }
  .history .none {
    padding: var(--ui-4);
    color: var(--ui-muted);
    font-size: var(--ui-fs-sm);
  }
  .thread {
    display: flex;
    align-items: center;
    gap: var(--ui-1);
    padding: 0 var(--ui-2) 0 0;
    border-bottom: 1px solid var(--ui-line);
  }
  .thread:last-child {
    border-bottom: 0;
  }
  .thread[data-current="true"] {
    background: var(--ui-selected);
  }
  .thread .open {
    flex: 1;
    min-width: 0;
    min-height: 3.25rem;
    padding: var(--ui-2) var(--ui-3);
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .thread .open:hover {
    background: var(--ui-hover);
  }
  .thread .t-title {
    display: block;
    overflow: hidden;
    font-size: var(--ui-fs-sm);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .thread .t-meta {
    display: block;
    color: var(--ui-muted);
    font-size: var(--ui-fs-xs);
  }

  /* ───── Panneaux ───── */
  .tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--ui-line);
    border-radius: var(--ui-radius);
    background: var(--sc-base);
  }
  .tabs button {
    position: relative;
    min-height: 2.5rem;
    border: 0;
    border-radius: calc(var(--ui-radius) * 0.75);
    background: transparent;
    color: var(--ui-muted);
    font: inherit;
    font-size: var(--ui-fs-sm);
    font-weight: 500;
    cursor: pointer;
  }
  .tabs button[aria-pressed="true"] {
    background: var(--ui-selected);
    color: var(--sc-base-content);
    font-weight: 600;
  }
  .tabs .unseen::after {
    content: "";
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    margin-inline-start: var(--ui-2);
    border-radius: 50%;
    background: var(--sc-primary);
  }
  .panes {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    gap: var(--ui-3);
  }
  .pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    background: var(--sc-base);
    border: 1px solid var(--ui-line);
    border-radius: var(--ui-radius);
  }
  .pane[data-hidden="true"] {
    display: none;
  }
  .pane-head {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-2);
    min-height: 3rem;
    padding: var(--ui-1) var(--ui-3);
    border-bottom: 1px solid var(--ui-line);
  }
  .pane-title {
    font-size: var(--ui-fs-sm);
    font-weight: 600;
  }
  .pane-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  .chat-body {
    display: flex;
    flex-direction: column;
    padding: var(--ui-3);
  }
  sonic-chat {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .preview-empty {
    height: 100%;
    display: grid;
    place-content: center;
    gap: var(--ui-2);
    padding: var(--ui-8) var(--ui-6);
    text-align: center;
  }
  .preview-empty p {
    max-width: 34ch;
    margin-inline: auto;
    color: var(--ui-muted);
    font-size: var(--ui-fs-sm);
  }

  /* Interrupteur « kits » : une vraie case à cocher, présentée en bascule. */
  .switch {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-2);
    min-height: 2.5rem;
    font-size: var(--ui-fs-sm);
    cursor: pointer;
    user-select: none;
  }
  .switch input {
    appearance: none;
    position: relative;
    flex: none;
    width: 2.25rem;
    height: 1.35rem;
    margin: 0;
    border-radius: 9999px;
    background: var(--ui-line-strong);
    cursor: pointer;
    transition: background-color 0.18s;
  }
  .switch input::after {
    content: "";
    position: absolute;
    inset-block-start: 0.2rem;
    inset-inline-start: 0.2rem;
    width: 0.95rem;
    height: 0.95rem;
    border-radius: 50%;
    background: var(--sc-base);
    transition: transform 0.18s var(--ui-ease);
  }
  .switch input:checked {
    background: var(--sc-primary);
  }
  .switch input:checked::after {
    transform: translateX(0.9rem);
    background: var(--sc-primary-content);
  }
  [dir="rtl"] .switch input:checked::after {
    transform: translateX(-0.9rem);
  }

  @media (min-width: 768px) {
    .atelier {
      padding: var(--ui-4);
      gap: var(--ui-4);
    }
  }
  /* Large : conversation à gauche, aperçu à droite, tout visible. */
  @media (min-width: 1024px) {
    .tabs {
      display: none;
    }
    .panes {
      grid-template-columns: minmax(21rem, 28rem) minmax(0, 1fr);
    }
    .pane[data-hidden="true"] {
      display: flex;
    }
  }
`;

@customElement("artifact-atelier-page")
export class ArtifactAtelierPage extends LitElement {
  static styles = [uiStyles, atelierStyles];

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
  /** Conversation en cours (id côté serveur) et son journal quand on la reprend. */
  @state() private threadId: string = crypto.randomUUID();
  @state() private restoreEntries: unknown[] = [];
  @state() private threads: AgentThreadSummary[] = [];
  @state() private historyOpen = false;
  /** Petit écran : un seul panneau à la fois. */
  @state() private tab: "chat" | "preview" = "chat";
  /** Un aperçu est arrivé pendant que l'onglet conversation était affiché. */
  @state() private unseen = false;
  /** Objets stables : le chat les relit à chaque run. */
  private chatHeaders: Record<string, string> = {};
  private chatContext: Record<string, unknown> = {};

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("click", this.onDocClick);
    document.addEventListener("keydown", this.onDocKey);
    const wanted = new URLSearchParams(location.search).get("thread");
    if (wanted) void this.resume(wanted);
    else if (this.slug) void this.loadCurrent();
    void this.checkAgent();
    void this.refreshThreads();
  }

  disconnectedCallback() {
    document.removeEventListener("click", this.onDocClick);
    document.removeEventListener("keydown", this.onDocKey);
    super.disconnectedCallback();
  }

  /** Clic en dehors du popover d'historique : on le referme. */
  private onDocClick = (e: Event) => {
    if (!this.historyOpen) return;
    const inside = e.composedPath().some((n) => n instanceof HTMLElement && n.hasAttribute("data-history-zone"));
    if (!inside) this.historyOpen = false;
  };

  private onDocKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.historyOpen) {
      this.historyOpen = false;
      this.renderRoot.querySelector<HTMLElement>("[data-history-toggle]")?.focus();
    }
  };

  private async refreshThreads() {
    if (!loadArtifactsAccount()) return;
    try {
      this.threads = await listAgentThreads();
    } catch {
      /* API ancienne : pas d'historique */
    }
  }

  private setThreadParam(id: string | null) {
    try {
      const url = new URL(location.href);
      if (id) url.searchParams.set("thread", id);
      else url.searchParams.delete("thread");
      history.replaceState(history.state, "", url);
    } catch {
      /* hors navigateur */
    }
  }

  /** Reprend une conversation : journal dans le chat, dernier aperçu, publication. */
  private async resume(threadId: string) {
    try {
      const t = await getAgentThread(threadId);
      this.preview = null;
      this.published = t.published?.slug ? {slug: t.published.slug, url: t.published.url, version: t.published.version} : null;
      if (t.preview?.document) this.showPreview(t.preview.document);
      else if (this.slug) void this.loadCurrent();
      this.restoreEntries = t.entries;
      this.threadId = t.threadId;
      this.historyOpen = false;
      this.error = "";
      this.setThreadParam(t.threadId);
    } catch {
      this.error = "Conversation introuvable.";
      this.setThreadParam(null);
    }
  }

  private newConversation() {
    this.preview = null;
    this.published = null;
    this.error = "";
    this.restoreEntries = [];
    this.threadId = crypto.randomUUID();
    this.historyOpen = false;
    this.setThreadParam(null);
    if (this.slug) void this.loadCurrent();
  }

  private onRunEnd = () => {
    this.setThreadParam(this.threadId);
    void this.refreshThreads();
  };

  private async renameThread(t: AgentThreadSummary) {
    const title = window.prompt("Nom de la conversation", t.title)?.trim();
    if (!title || title === t.title) return;
    try {
      await renameAgentThread(t.threadId, title);
      await this.refreshThreads();
    } catch {
      this.error = "Renommage impossible.";
    }
  }

  private async removeThread(t: AgentThreadSummary) {
    if (!window.confirm(`Supprimer la conversation « ${t.title || "sans titre"} » ?`)) return;
    try {
      await deleteAgentThread(t.threadId);
    } catch {
      this.error = "Suppression impossible.";
      return;
    }
    if (t.threadId === this.threadId) this.newConversation();
    await this.refreshThreads();
  }

  private renderHistory() {
    if (!this.historyOpen) return nothing;
    return html`<div class="history" data-history role="region" aria-label="Conversations enregistrées">
      ${this.threads.length === 0
        ? html`<p class="none">Aucune conversation enregistrée pour l’instant.</p>`
        : html`<ul>
            ${this.threads.map(
              (t) => html`<li
                class="thread"
                data-current=${t.threadId === this.threadId ? "true" : "false"}
                data-thread=${t.threadId}
              >
                <button type="button" class="open" @click=${() => void this.resume(t.threadId)}>
                  <span class="t-title">${t.title || "Sans titre"}</span>
                  <span class="t-meta">
                    <time datetime=${t.updatedAt} title=${fullDate(t.updatedAt)}>${relativeTime(t.updatedAt)}</time>${t.artifactSlug
                      ? html` · <code>${t.artifactSlug}</code>`
                      : nothing}
                  </span>
                </button>
                <sonic-button
                  size="sm"
                  variant="ghost"
                  shape="circle"
                  title="Renommer"
                  data-aria-label=${`Renommer ${t.title || "la conversation"}`}
                  @click=${() => void this.renameThread(t)}
                >
                  <sonic-icon library="custom" name="edit-pencil" size="sm"></sonic-icon>
                </sonic-button>
                <sonic-button
                  size="sm"
                  variant="ghost"
                  shape="circle"
                  title="Supprimer"
                  data-aria-label=${`Supprimer ${t.title || "la conversation"}`}
                  @click=${() => void this.removeThread(t)}
                >
                  <sonic-icon library="custom" name="trash" size="sm"></sonic-icon>
                </sonic-button>
              </li>`,
            )}
          </ul>`}
    </div>`;
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
    return html`<div class="notice" data-tone="warning" role="status" data-agent-not-configured>
      <sonic-icon library="custom" name="warning-triangle" size="sm"></sonic-icon>
      <span class="grow">L’assistant n’est pas encore configuré : choisissez un fournisseur et saisissez votre clé API dans Tadaaa.</span>
      <a href=${tadaaaAssistantSettingsUrl()} target="_blank" rel="noopener">Configurer l’assistant</a>
      <sonic-button size="xs" variant="outline" @click=${() => void this.checkAgent()}>J’ai configuré, vérifier</sonic-button>
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
    if (this.tab === "chat") this.unseen = true;
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

  private renderPublish() {
    if (this.published && this.published.slug !== this.slug) {
      return html`<sonic-button
        size="sm"
        type="primary"
        data-published
        href=${this.published.url ?? `/${this.published.slug}`}
        target="_blank"
        >Publié : ${this.published.slug}${this.published.version ? ` (v${this.published.version})` : ""}</sonic-button
      >`;
    }
    if (this.slug) {
      return html`<sonic-button size="sm" variant="outline" @click=${() => navigate(`/${this.slug}/`)}
        >Voir la page${this.published?.version ? ` (v${this.published.version})` : ""}</sonic-button
      >`;
    }
    return nothing;
  }

  private selectTab(tab: "chat" | "preview") {
    this.tab = tab;
    if (tab === "preview") this.unseen = false;
  }

  render() {
    const account = loadArtifactsAccount();
    if (!account) {
      return html`<div class="atelier">
        <div class="panel empty">
          <h2>Connectez-vous pour utiliser l’atelier</h2>
          <p>L’atelier crée et modifie vos artefacts avec l’assistant de votre compte Tadaaa.</p>
          <sonic-button type="primary" @click=${() => navigate("/cloud")}>Aller au compte</sonic-button>
        </div>
      </div>`;
    }
    const endpoint = `${getApiRoot(account)}/agent/artifacts/run`;
    this.chatHeaders.Authorization = `Bearer ${account.token}`;
    if (this.slug) this.chatContext.artifact = {slug: this.slug};
    this.chatContext.atelier = {kits: this.useKits};
    return html`
      <div class="atelier">
        <div class="bar" data-history-zone>
          <div class="titles">
            <h1>Atelier</h1>
            <p class="sub">
              ${this.slug
                ? html`Modification de <code>${this.slug}</code>`
                : "Décrivez l’artefact à créer, l’aperçu se met à jour au fil de la conversation."}
            </p>
          </div>
          <div class="actions">
            <sonic-button
              size="sm"
              variant="outline"
              data-history-toggle
              data-aria-expanded=${this.historyOpen ? "true" : "false"}
              @click=${() => {
                this.historyOpen = !this.historyOpen;
                if (this.historyOpen) void this.refreshThreads();
              }}
            >
              <sonic-icon slot="prefix" library="custom" name="clock" size="sm"></sonic-icon>
              Historique${this.threads.length ? ` (${this.threads.length})` : ""}
            </sonic-button>
            <sonic-button size="sm" variant="outline" data-new-thread @click=${() => this.newConversation()}>
              <sonic-icon slot="prefix" library="custom" name="plus" size="sm"></sonic-icon>
              Nouvelle conversation
            </sonic-button>
          </div>
          ${this.renderHistory()}
        </div>

        ${this.error
          ? html`<div class="notice" data-tone="danger" role="alert">
              <sonic-icon library="custom" name="warning-triangle" size="sm"></sonic-icon>
              <span class="grow">${this.error}</span>
            </div>`
          : nothing}
        ${this.renderAgentBanner()}

        <div class="tabs" role="group" aria-label="Panneau affiché">
          <button
            type="button"
            aria-pressed=${this.tab === "chat" ? "true" : "false"}
            @click=${() => this.selectTab("chat")}
          >
            Conversation
          </button>
          <button
            type="button"
            class=${this.unseen ? "unseen" : ""}
            aria-pressed=${this.tab === "preview" ? "true" : "false"}
            @click=${() => this.selectTab("preview")}
          >
            Aperçu${this.unseen ? html`<span class="sr-only"> (nouvelle version)</span>` : nothing}
          </button>
        </div>

        <div class="panes">
          <section class="pane" data-hidden=${this.tab === "chat" ? "false" : "true"} aria-label="Conversation">
            <div class="pane-head">
              <span class="pane-title">Conversation</span>
              <label
                class="switch"
                title="Décoché : l’agent compose tout librement, sans partir des kits (quiz, jeux, shader, page, sondage)."
              >
                <input
                  type="checkbox"
                  data-kits-toggle
                  .checked=${this.useKits}
                  @change=${(e: Event) => this.setUseKits((e.target as HTMLInputElement).checked)}
                />
                Kits
              </label>
            </div>
            <div class="pane-body chat-body">
              <sonic-chat
                endpoint=${endpoint}
                empty-text=${this.slug
                  ? "Dites ce que vous voulez changer dans cet artefact."
                  : "Décrivez ce que vous voulez créer : un quiz, un sondage, un jeu, une visualisation…"}
                thread-id=${this.threadId}
                .restoreEntries=${this.restoreEntries}
                placeholder=${this.slug
                  ? "Que faut-il changer ?"
                  : "Ex. : un quiz de 5 questions sur les châteaux de la Loire"}
                .headers=${this.chatHeaders}
                .forwardedProps=${this.chatContext}
                .toolLabels=${atelierToolLabels}
                @chat-custom=${this.onCustom}
                @chat-run-error=${this.onRunError}
                @chat-run-end=${this.onRunEnd}
              ></sonic-chat>
            </div>
          </section>
          <section class="pane" data-hidden=${this.tab === "preview" ? "false" : "true"} aria-label="Aperçu">
            <div class="pane-head">
              <span class="pane-title">Aperçu</span>
              ${this.renderPublish()}
            </div>
            <div class="pane-body">
              ${this.preview
                ? html`<artifact-viewer
                    embedded
                    slug=${this.slug || "atelier"}
                    .previewDocument=${this.preview}
                    data-version=${this.previewVersion}
                  ></artifact-viewer>`
                : html`<div class="preview-empty">
                    <h2>L’aperçu apparaît ici</h2>
                    <p>
                      Chaque version proposée par l’agent s’affiche ici avant la publication, que vous
                      confirmez dans la conversation.
                    </p>
                  </div>`}
            </div>
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
