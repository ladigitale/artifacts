import "@supersoniks/concorde/button";
import "@supersoniks/concorde/icon";
import {css, html, LitElement, nothing} from "lit";
import {customElement, state} from "lit/decorators.js";
import {uiStyles} from "../styles/ui";
import {artStyles, ensureArtFonts} from "../css/art";
import {loadArtifactsAccount, type ArtifactsAccount} from "../cloud/account";
import {
  artifactSharePath,
  cloudReturnUrl,
  createMcpAccessToken,
  fetchAgentSettingsStatus,
  listMyArtifacts,
  mcpServerUrl,
  tadaaaAssistantSettingsUrl,
  tadaaaLoginUrl,
  tadaaaRegisterUrl,
  type ArtifactSummary,
} from "../cloud/client";
import {navigate} from "../navigate";
import "./artifact-logo";
import "./artifact-legal-links";

type Client = "claude" | "claude-code" | "cursor" | "atelier";

const CLIENTS: {id: Client; label: string}[] = [
  {id: "claude", label: "Claude"},
  {id: "claude-code", label: "Claude Code"},
  {id: "cursor", label: "Cursor"},
  {id: "atelier", label: "Dans le navigateur"},
];

const CLIENT_KEY = "artifacts-onboarding-client";
const FIRST_PROMPT =
  "Avec Tadaaa, crée et publie un artefact : un quiz de 5 questions sur les châteaux de la Loire, avec le score à la fin. Donne-moi le lien.";
const POLL_MS = 5000;

/** Parcours guidé : compte, branchement de l'assistant, premier artefact. */
@customElement("artifact-onboarding")
export class ArtifactOnboarding extends LitElement {
  static styles = [
    uiStyles,
    artStyles,
    css`
      :host {
        height: 100vh;
        height: 100dvh;
        overflow-y: auto;
        background: var(--sc-base-50);
      }
      header,
      main {
        width: 100%;
        max-width: 46rem;
        margin-inline: auto;
        padding-inline: var(--ui-4);
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ui-4);
        padding-block: var(--ui-4);
      }
      main {
        display: flex;
        flex-direction: column;
        gap: var(--ui-6);
        padding-block: var(--ui-6) var(--ui-12);
      }
      h1 {
        font-size: clamp(1.75rem, 5vw, 2.5rem);
        line-height: 1.1;
        letter-spacing: -0.02em;
        font-weight: 700;
      }
      .lede {
        color: var(--ui-muted);
        font-size: var(--ui-fs-lg);
        max-width: 36rem;
      }
      .steps {
        display: flex;
        flex-direction: column;
        gap: var(--ui-4);
      }
      .step {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: var(--ui-3) var(--ui-4);
        padding: var(--ui-4);
        background: var(--sc-base);
        border: 1px solid var(--ui-line);
        border-radius: calc(var(--ui-radius) * 1.5);
      }
      .step[data-state="current"] {
        border-color: var(--ui-line-strong);
        box-shadow: var(--ui-shadow-pop);
      }
      .badge {
        display: inline-grid;
        place-items: center;
        width: 2rem;
        height: 2rem;
        border-radius: 50%;
        border: 1px solid var(--ui-line-strong);
        font-weight: 700;
        font-size: var(--ui-fs-sm);
      }
      .step[data-state="done"] .badge {
        background: var(--sc-success, var(--sc-primary));
        border-color: transparent;
        color: var(--sc-success-content, var(--sc-primary-content));
      }
      .step[data-state="current"] .badge {
        background: var(--sc-primary);
        border-color: transparent;
        color: var(--sc-primary-content);
      }
      .body {
        display: flex;
        flex-direction: column;
        gap: var(--ui-3);
        min-width: 0;
      }
      h2 {
        font-size: var(--ui-fs-lg);
        line-height: 2rem;
        font-weight: 650;
      }
      .muted {
        color: var(--ui-muted);
        font-size: var(--ui-fs-sm);
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--ui-2);
      }
      .tabs {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ui-1);
        padding: var(--ui-1);
        background: var(--sc-base-50);
        border: 1px solid var(--ui-line);
        border-radius: var(--ui-radius);
        width: fit-content;
        max-width: 100%;
      }
      .tabs button {
        appearance: none;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        font-size: var(--ui-fs-sm);
        font-weight: 500;
        padding: var(--ui-2) var(--ui-3);
        border-radius: calc(var(--ui-radius) - 2px);
        cursor: pointer;
      }
      .tabs button:hover {
        background: var(--ui-hover);
      }
      .tabs button[aria-selected="true"] {
        background: var(--sc-base);
        box-shadow: 0 0 0 1px var(--ui-line-strong);
      }
      ol.how {
        display: flex;
        flex-direction: column;
        gap: var(--ui-3);
        counter-reset: how;
      }
      ol.how > li {
        display: grid;
        grid-template-columns: 1.5rem minmax(0, 1fr);
        gap: var(--ui-2);
        counter-increment: how;
      }
      ol.how > li::before {
        content: counter(how) ".";
        color: var(--ui-muted);
        font-variant-numeric: tabular-nums;
      }
      ol.how > li > div {
        display: flex;
        flex-direction: column;
        gap: var(--ui-2);
        min-width: 0;
      }
      .copy {
        display: flex;
        align-items: stretch;
        gap: var(--ui-2);
        min-width: 0;
      }
      .copy code,
      .copy pre {
        flex: 1;
        min-width: 0;
        margin: 0;
        padding: var(--ui-2) var(--ui-3);
        background: var(--sc-base-50);
        border: 1px solid var(--ui-line);
        border-radius: var(--ui-radius);
        font-size: var(--ui-fs-sm);
        overflow-x: auto;
        white-space: pre;
      }
      .copy .prompt {
        white-space: normal;
        font-family: inherit;
        line-height: 1.45;
      }
      .copy sonic-button {
        flex: none;
        align-self: flex-start;
      }
      .result {
        display: flex;
        flex-direction: column;
        gap: var(--ui-2);
      }
      .result a.link {
        font-weight: 600;
        overflow-wrap: anywhere;
      }
      .waiting {
        display: inline-flex;
        align-items: center;
        gap: var(--ui-2);
      }
      .dot {
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
        background: var(--sc-primary);
        animation: pulse 1.4s var(--ui-ease) infinite;
      }
      @keyframes pulse {
        50% {
          opacity: 0.25;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .dot {
          animation: none;
        }
      }
      .invite {
        padding: var(--ui-4);
        border: 1px dashed var(--ui-line-strong);
        border-radius: calc(var(--ui-radius) * 1.5);
        display: flex;
        flex-direction: column;
        gap: var(--ui-2);
      }

      /* ───── Même direction que l'accueil (art.ts) : papier, encre, vermillon ───── */
      :host {
        font-family: var(--art-display);
      }
      header {
        border-bottom: var(--art-edge);
      }
      .edition {
        font-family: var(--art-serif);
        font-style: italic;
      }
      h1 {
        font-size: clamp(2.25rem, 7vw, 4rem);
        line-height: 0.95;
        font-weight: 800;
        font-stretch: 85%;
        letter-spacing: -0.04em;
        text-transform: uppercase;
      }
      h1 .serif {
        display: inline-block;
        text-transform: none;
        font-size: 1.12em;
        color: var(--art-hot);
        transform: rotate(-3deg);
      }
      .lede {
        color: var(--art-ink);
        font-weight: 400;
      }
      .steps {
        gap: var(--ui-6);
      }
      .step {
        padding: var(--ui-6);
        border: var(--art-edge);
        border-radius: 0;
        background: var(--art-card);
        box-shadow: none;
      }
      .step:nth-child(odd) {
        transform: rotate(-0.5deg);
      }
      .step:nth-child(even) {
        transform: rotate(0.45deg);
      }
      .step[data-state="current"] {
        box-shadow: 6px 6px 0 var(--art-hot);
      }
      .step[data-state="todo"] {
        border-style: dashed;
        background: transparent;
      }
      .badge,
      .step[data-state="current"] .badge,
      .step[data-state="done"] .badge {
        width: 3rem;
        height: 3rem;
        border: 0;
        border-radius: 0;
        background: none;
        color: var(--art-ink);
        font-family: var(--art-serif);
        font-style: italic;
        font-weight: 400;
        font-size: 3.4rem;
        line-height: 0.8;
        transform: rotate(-8deg);
      }
      .step[data-state="current"] .badge {
        color: var(--art-hot);
      }
      .step[data-state="done"] .badge {
        color: var(--art-moss);
        font-size: 2.4rem;
      }
      h2 {
        line-height: 3rem;
        font-size: var(--ui-fs-xl);
        font-weight: 800;
        font-stretch: 85%;
        letter-spacing: -0.02em;
        text-transform: uppercase;
      }
      .muted {
        color: color-mix(in srgb, var(--art-ink) 78%, transparent);
      }
      .tabs {
        padding: 0;
        gap: 0;
        border: var(--art-edge);
        border-radius: 0;
        background: var(--art-card);
        overflow: hidden;
      }
      .tabs button {
        border-radius: 0;
        font-weight: 700;
        padding: var(--ui-2) var(--ui-4);
      }
      .tabs button + button {
        border-inline-start: 1.5px solid var(--art-ink);
      }
      .tabs button[aria-selected="true"] {
        background: var(--art-ink);
        color: var(--art-paper);
        box-shadow: none;
      }
      .copy code,
      .copy pre {
        border: var(--art-edge);
        border-radius: 0;
        background: var(--art-paper);
      }
      .dot {
        background: var(--art-hot);
        border-radius: 0;
        transform: rotate(45deg);
      }
      .invite {
        padding: var(--ui-6);
        border: var(--art-edge);
        border-radius: 0;
        background: var(--art-sun);
        box-shadow: var(--art-hard);
        transform: rotate(0.8deg);
      }
      .invite h2 {
        line-height: 1.1;
      }
      .invite .muted {
        color: var(--art-ink);
      }
      .invite .copy code {
        background: var(--art-card);
      }
      footer {
        width: 100%;
        max-width: 46rem;
        margin-inline: auto;
        padding: 0 var(--ui-4) var(--ui-8);
        font-size: var(--ui-fs-sm);
      }
    `,
  ];

  @state() private account: ArtifactsAccount | null = loadArtifactsAccount();
  @state() private client: Client = "claude";
  @state() private artifacts: ArtifactSummary[] | null = null;
  @state() private baseline: Set<string> | null = null;
  @state() private fresh: ArtifactSummary | null = null;
  @state() private copied = "";
  @state() private token = "";
  @state() private tokenBusy = false;
  @state() private tokenError = "";
  @state() private agentReady: boolean | null = null;

  private timer: ReturnType<typeof setInterval> | undefined;

  connectedCallback(): void {
    super.connectedCallback();
    try {
      const saved = localStorage.getItem(CLIENT_KEY) as Client | null;
      if (saved && CLIENTS.some((c) => c.id === saved)) this.client = saved;
    } catch {
      /* stockage indisponible */
    }
    this.account = loadArtifactsAccount();
    ensureArtFonts();
    if (this.account) {
      void this.refresh();
      this.timer = setInterval(() => {
        if (document.visibilityState === "visible" && !this.fresh) void this.refresh();
      }, POLL_MS);
      void fetchAgentSettingsStatus()
        .then((s) => (this.agentReady = s.configured || s.serverKeyAvailable))
        .catch(() => (this.agentReady = null));
    }
  }

  disconnectedCallback(): void {
    clearInterval(this.timer);
    super.disconnectedCallback();
  }

  /** Relit la bibliothèque ; le premier artefact apparu depuis l'arrivée valide l'étape 3. */
  private async refresh() {
    try {
      const list = await listMyArtifacts();
      if (!this.baseline) this.baseline = new Set(list.map((a) => a.id));
      else this.fresh = list.find((a) => !this.baseline!.has(a.id)) ?? this.fresh;
      this.artifacts = list;
    } catch {
      this.account = loadArtifactsAccount();
      if (!this.account) clearInterval(this.timer);
    }
  }

  private register() {
    location.assign(tadaaaRegisterUrl(cloudReturnUrl("/demarrer")));
  }

  private login() {
    location.assign(tadaaaLoginUrl(cloudReturnUrl("/demarrer")));
  }

  private pick(id: Client) {
    this.client = id;
    try {
      localStorage.setItem(CLIENT_KEY, id);
    } catch {
      /* stockage indisponible */
    }
  }

  private async copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.copied = key;
      setTimeout(() => {
        if (this.copied === key) this.copied = "";
      }, 2000);
    } catch {
      this.copied = "";
    }
  }

  private async makeToken() {
    this.tokenBusy = true;
    this.tokenError = "";
    try {
      const created = await createMcpAccessToken("Cursor");
      this.token = created.plainToken;
    } catch (e) {
      this.tokenError = e instanceof Error ? e.message : "Création du jeton impossible.";
    } finally {
      this.tokenBusy = false;
    }
  }

  private cursorConfig(): string {
    return JSON.stringify(
      {mcpServers: {tadaaa: {url: mcpServerUrl(), headers: {Authorization: `Bearer ${this.token}`}}}},
      null,
      2,
    );
  }

  private copyable(key: string, text: string, opts: {block?: boolean; prompt?: boolean; label?: string} = {}) {
    const done = this.copied === key;
    return html`
      <div class="copy">
        ${opts.block
          ? html`<pre data-copy=${key}>${text}</pre>`
          : html`<code class=${opts.prompt ? "prompt" : ""} data-copy=${key}>${text}</code>`}
        <sonic-button type="default" variant="outline" size="sm" @click=${() => void this.copy(key, text)}>
          <sonic-icon slot="prefix" library="custom" name=${done ? "check" : "copy"} size="sm"></sonic-icon>
          ${done ? "Copié" : (opts.label ?? "Copier")}
        </sonic-button>
      </div>
    `;
  }

  private renderAccount(state: string) {
    const email = this.account?.user?.email;
    return html`
      <li class="step" data-state=${state} data-step="account">
        <span class="badge" aria-hidden="true">${state === "done" ? "✓" : "1"}</span>
        <div class="body">
          <h2>Créer votre compte</h2>
          ${this.account
            ? html`<p class="muted">Connecté${email ? html` : <strong>${email}</strong>` : nothing}.</p>`
            : html`
                <p class="muted">
                  Un email, un mot de passe. Vous recevez un lien de confirmation : il vous ramène ici,
                  connecté.
                </p>
                <div class="row">
                  <sonic-button type="primary" @click=${() => this.register()}>Créer mon compte</sonic-button>
                  <sonic-button type="default" variant="ghost" @click=${() => this.login()}>
                    J’ai déjà un compte
                  </sonic-button>
                </div>
              `}
        </div>
      </li>
    `;
  }

  private renderClientHelp() {
    const url = mcpServerUrl();
    switch (this.client) {
      case "claude":
        return html`
          <ol class="how">
            <li>
              <div>
                <span>
                  Dans Claude, ouvrez
                  <a href="https://claude.ai/customize/connectors" target="_blank" rel="noopener"
                    >Personnaliser › Connecteurs</a
                  >, puis « Ajouter » et « Ajouter un connecteur personnalisé ».
                </span>
              </div>
            </li>
            <li>
              <div>
                <span>Nommez-le <strong>Tadaaa</strong> et collez cette adresse :</span>
                ${this.copyable("mcp-url", url)}
              </div>
            </li>
            <li>
              <div>
                <span>
                  Validez, cliquez sur « Connecter » et identifiez-vous avec le compte de l’étape 1. Aucun
                  jeton à copier.
                </span>
              </div>
            </li>
          </ol>
          <p class="muted">
            Une fois ajouté, le connecteur suit votre compte Claude sur le web, l’ordinateur et le mobile.
            L’offre gratuite de Claude autorise un seul connecteur personnalisé.
          </p>
        `;
      case "claude-code":
        return html`
          <ol class="how">
            <li>
              <div>
                <span>Dans un terminal :</span>
                ${this.copyable("cc-add", `claude mcp add --transport http tadaaa ${url}`)}
              </div>
            </li>
            <li>
              <div>
                <span>
                  Lancez <code>claude</code>, tapez <code>/mcp</code>, choisissez <strong>tadaaa</strong> et
                  identifiez-vous dans le navigateur avec le compte de l’étape 1.
                </span>
              </div>
            </li>
          </ol>
        `;
      case "cursor":
        return html`
          <ol class="how">
            <li>
              <div>
                <span>Créez un jeton d’accès. Il n’est affiché qu’une fois.</span>
                ${this.token
                  ? nothing
                  : html`<div class="row">
                      <sonic-button
                        type="primary"
                        size="sm"
                        ?disabled=${!this.account || this.tokenBusy}
                        @click=${() => void this.makeToken()}
                      >
                        Créer mon jeton
                      </sonic-button>
                      ${this.account ? nothing : html`<span class="muted">Après l’étape 1.</span>`}
                    </div>`}
                ${this.tokenError
                  ? html`<p class="notice" data-tone="danger" role="alert">${this.tokenError}</p>`
                  : nothing}
              </div>
            </li>
            <li>
              <div>
                <span>
                  Collez cette configuration dans <code>~/.cursor/mcp.json</code> (ou Réglages › MCP ›
                  Ajouter un serveur) :
                </span>
                ${this.token
                  ? this.copyable("cursor-json", this.cursorConfig(), {block: true})
                  : html`<p class="muted">Elle apparaît ici dès que le jeton est créé.</p>`}
              </div>
            </li>
          </ol>
        `;
      case "atelier":
        return html`
          <p>
            L’atelier crée l’artefact en conversation, ici même, sans rien installer. Il fonctionne avec
            <strong>votre propre clé</strong> de modèle (Anthropic, OpenAI, Mistral…).
          </p>
          ${this.account && this.agentReady
            ? html`<div class="row">
                <sonic-button type="primary" size="sm" @click=${() => navigate("/admin/atelier")}>
                  Ouvrir l’atelier
                </sonic-button>
              </div>`
            : html`<div class="row">
                <a href=${tadaaaAssistantSettingsUrl()} target="_blank" rel="noopener">Saisir ma clé dans Tadaaa</a>
                <span class="muted">Pas de clé ? Choisissez plutôt l’onglet Claude.</span>
              </div>`}
        `;
    }
  }

  private renderConnect(state: string) {
    return html`
      <li class="step" data-state=${state} data-step="connect">
        <span class="badge" aria-hidden="true">${state === "done" ? "✓" : "2"}</span>
        <div class="body">
          <h2>Brancher votre assistant</h2>
          <p class="muted">Votre assistant publie les artefacts à votre place. Lequel utilisez-vous ?</p>
          <div class="tabs" role="tablist" aria-label="Assistant">
            ${CLIENTS.map(
              (c) => html`
                <button
                  type="button"
                  role="tab"
                  data-client=${c.id}
                  aria-selected=${this.client === c.id ? "true" : "false"}
                  @click=${() => this.pick(c.id)}
                >
                  ${c.label}
                </button>
              `,
            )}
          </div>
          <div role="tabpanel">${this.renderClientHelp()}</div>
        </div>
      </li>
    `;
  }

  private renderPublish(state: string) {
    const shown = this.fresh ?? (state === "done" ? (this.artifacts?.[0] ?? null) : null);
    const link = shown ? new URL(artifactSharePath(shown), location.origin).toString() : "";
    return html`
      <li class="step" data-state=${state} data-step="publish">
        <span class="badge" aria-hidden="true">${state === "done" ? "✓" : "3"}</span>
        <div class="body">
          <h2>Publier votre premier artefact</h2>
          ${shown
            ? html`
                <div class="result" data-first-artifact=${shown.slug}>
                  <p>${this.fresh ? "Il est en ligne :" : "Vous avez déjà publié :"} <strong>${shown.title}</strong></p>
                  <a class="link" href=${link} target="_blank" rel="noopener">${link}</a>
                  <div class="row">
                    <sonic-button type="primary" size="sm" @click=${() => void this.copy("share", link)}>
                      ${this.copied === "share" ? "Lien copié" : "Copier le lien"}
                    </sonic-button>
                    <sonic-button type="default" variant="outline" size="sm" @click=${() => navigate("/admin")}>
                      Ouvrir ma bibliothèque
                    </sonic-button>
                  </div>
                  <p class="muted">
                    Un artefact naît privé. Dans la bibliothèque, passez-le en « public » ou « par lien »
                    pour le partager.
                  </p>
                </div>
              `
            : html`
                <p class="muted">Dites-le simplement à votre assistant, par exemple :</p>
                ${this.copyable("prompt", FIRST_PROMPT, {prompt: true})}
                ${this.account
                  ? html`<p class="muted waiting" role="status">
                      <span class="dot" aria-hidden="true"></span>
                      En attente de votre premier artefact : cette page le détecte toute seule.
                    </p>`
                  : nothing}
              `}
        </div>
      </li>
    `;
  }

  protected render() {
    const hasAccount = !!this.account;
    const published = !!this.fresh || (this.artifacts?.length ?? 0) > 0;
    const s1 = hasAccount ? "done" : "current";
    const s3 = published ? "done" : "todo";
    const s2 = published ? "done" : hasAccount ? "current" : "todo";
    const invite = new URL("/demarrer", location.origin).toString();
    return html`
      <header>
        <artifact-logo wordmark size="2rem" href="/"></artifact-logo>
        <span class="edition">mode d’emploi</span>
      </header>
      <main>
        <h1>Votre premier artefact en <span class="serif">trois étapes</span></h1>
        <p class="lede">
          Un artefact est une page interactive (quiz, jeu, instrument, carte) que votre assistant IA
          fabrique et met en ligne pour vous. Comptez cinq minutes.
        </p>
        <ol class="steps">
          ${this.renderAccount(s1)} ${this.renderConnect(s2)} ${this.renderPublish(s3)}
        </ol>
        <section class="invite" aria-labelledby="invite-title">
          <h2 id="invite-title">Inviter quelqu’un</h2>
          <p class="muted">Envoyez ce lien : il ouvre directement ce parcours.</p>
          ${this.copyable("invite", invite)}
        </section>
      </main>
      <footer><artifact-legal-links></artifact-legal-links></footer>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "artifact-onboarding": ArtifactOnboarding;
  }
}
