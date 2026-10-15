import "@supersoniks/concorde/button";
import "@supersoniks/concorde/icon";
import "@supersoniks/concorde/input";
import {css, html, LitElement, nothing} from "lit";
import {customElement, property, state} from "lit/decorators.js";
import {dp, set} from "@supersoniks/concorde/utils";
import {subscribe} from "@supersoniks/concorde/decorators";
import {fullDate, uiStyles, VISIBILITY_LABELS} from "../styles/ui";
import {
  artifactEditFormKey,
  emptyArtifactEditForm,
  type ArtifactEditForm,
} from "../dp";
import {getArtifact, patchArtifact} from "../cloud/client";
import {loadArtifactsAccount} from "../cloud/account";
import {explainFetchError, loadApiBaseUrl} from "../cloud/api-base";
import {navigate} from "../navigate";

const editStyles = css`
  .layout {
    display: grid;
    gap: var(--ui-6);
    align-items: start;
  }
  @media (min-width: 960px) {
    .layout {
      grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
    }
  }
  .slug-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ui-2) var(--ui-3);
    color: var(--ui-muted);
    font-size: var(--ui-fs-sm);
  }
  .choices {
    display: grid;
    gap: var(--ui-2);
    grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
  }
  .choice {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-height: 3.5rem;
    padding: var(--ui-3);
    border: 1px solid var(--ui-line-strong);
    border-radius: var(--ui-radius);
    background: var(--sc-base);
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: background-color 0.15s, border-color 0.15s;
  }
  .choice:hover {
    background: var(--ui-hover);
  }
  .choice[aria-checked="true"] {
    background: var(--ui-selected);
    border-color: var(--sc-primary);
    box-shadow: inset 0 0 0 1px var(--sc-primary);
  }
  .choice-title {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-1);
    font-size: var(--ui-fs-sm);
    font-weight: 600;
  }
  .choice-hint {
    color: var(--ui-muted);
    font-size: var(--ui-fs-xs);
  }
  .snippet {
    margin: 0;
    padding: var(--ui-3) var(--ui-4);
    border: 1px solid var(--ui-line);
    border-radius: var(--ui-radius);
    background: var(--sc-base-50);
    font-size: var(--ui-fs-xs);
    line-height: 1.6;
    overflow-x: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  details {
    font-size: var(--ui-fs-sm);
    color: var(--ui-muted);
  }
  summary {
    cursor: pointer;
    padding: var(--ui-1) 0;
    color: var(--sc-base-content);
    font-weight: 500;
  }
  details ul {
    display: flex;
    flex-direction: column;
    gap: var(--ui-1);
    margin-top: var(--ui-2);
  }
`;

@customElement("artifact-edit-page")
export class ArtifactEditPage extends LitElement {
  static styles = [uiStyles, editStyles];

  @subscribe(artifactEditFormKey)
  @state()
  form: ArtifactEditForm = emptyArtifactEditForm();

  @property({type: String}) slug = "";

  @state() private error = "";
  @state() private loading = true;
  @state() private saving = false;
  @state() private artifactId = "";
  @state() private visibility = "private";
  @state() private linkToken: string | null = null;
  @state() private copied = false;
  @state() private saved = false;
  @state() private heading = "";
  @state() private updatedAt = "";
  /** Photographie du formulaire à l'ouverture : sert à savoir s'il y a quelque chose à enregistrer. */
  @state() private initial = "";

  connectedCallback() {
    super.connectedCallback();
    dp(artifactEditFormKey);
    set(artifactEditFormKey, emptyArtifactEditForm());
    void this.load();
  }

  private async load() {
    this.loading = true;
    this.error = "";
    if (!loadArtifactsAccount()) {
      this.error = "Connectez-vous pour éditer.";
      this.loading = false;
      return;
    }
    try {
      const a = await getArtifact(this.slug);
      this.artifactId = a.id;
      this.visibility = a.visibility ?? "private";
      this.linkToken = a.linkToken ?? null;
      this.heading = a.title ?? a.slug;
      this.updatedAt = a.updatedAt ?? "";
      const next = {
        title: a.title ?? "",
        description: a.description ?? "",
        slug: a.slug ?? "",
        visibility: a.visibility ?? "private",
      };
      set(artifactEditFormKey, next);
      this.initial = JSON.stringify(next);
    } catch (e) {
      this.error = explainFetchError(e, loadApiBaseUrl());
    } finally {
      this.loading = false;
    }
  }

  private setVisibility(value: string) {
    set(artifactEditFormKey, {...emptyArtifactEditForm(), ...(this.form ?? {}), visibility: value});
  }

  private dirty(): boolean {
    const f = this.form;
    if (!f) return false;
    return (
      JSON.stringify({
        title: f.title ?? "",
        description: f.description ?? "",
        slug: f.slug ?? "",
        visibility: f.visibility ?? "",
      }) !== this.initial
    );
  }

  private async save(e: Event) {
    e.preventDefault();
    if (this.saving) return;
    const form = dp(artifactEditFormKey).get() as ArtifactEditForm | undefined;
    if (!form || !this.artifactId) return;
    this.saving = true;
    this.saved = false;
    this.error = "";
    try {
      const updated = await patchArtifact(this.artifactId, {
        title: form.title,
        description: form.description || null,
        slug: form.slug,
        visibility: form.visibility,
      });
      navigate(`/admin/${updated.slug}/edit`);
      this.slug = updated.slug;
      await this.load();
      this.saved = true;
    } catch (err) {
      this.error = explainFetchError(err, loadApiBaseUrl());
    } finally {
      this.saving = false;
    }
  }

  /** Balise d'intégration (embed.js) ; un artefact « lien » embarque son jeton. */
  private embedSnippet(): string {
    const src = new URL("/embed.js", location.origin).href;
    const key = this.visibility === "link" && this.linkToken ? ` data-key="${this.linkToken}"` : "";
    return `<script src="${src}" data-artifact="${this.slug}"${key} async></script>`;
  }

  private async copySnippet() {
    try {
      await navigator.clipboard.writeText(this.embedSnippet());
      this.copied = true;
      setTimeout(() => (this.copied = false), 1800);
    } catch {
      /* presse-papiers refusé : le texte reste sélectionnable */
    }
  }

  private renderEmbed() {
    return html`
      <section class="panel panel-pad section" aria-labelledby="embed-title">
        <div class="section-head">
          <h2 id="embed-title">Intégrer sur un site</h2>
          <p class="sub">Collez cette balise dans la page où l’artefact doit apparaître.</p>
        </div>
        ${this.visibility === "private"
          ? html`<p class="hint">
              Cet artefact est privé. Passez-le en « Public » ou « Lien » pour l’intégrer ailleurs.
            </p>`
          : html`
              <pre class="snippet"><code>${this.embedSnippet()}</code></pre>
              <div class="actions">
                <sonic-button type="primary" size="sm" @click=${() => this.copySnippet()}>
                  <sonic-icon
                    slot="prefix"
                    library="custom"
                    name=${this.copied ? "check" : "copy"}
                    size="sm"
                  ></sonic-icon>
                  ${this.copied ? "Balise copiée" : "Copier la balise"}
                </sonic-button>
              </div>
              ${this.visibility === "link"
                ? html`<p class="hint">Le jeton de lien est visible dans le code de la page hôte.</p>`
                : nothing}
              <details>
                <summary>Options de la balise</summary>
                <ul>
                  <li><code>data-theme</code> — thème de l’intégration</li>
                  <li><code>data-view</code> — vue affichée au démarrage</li>
                  <li><code>data-height</code> — hauteur fixe</li>
                  <li><code>data-target</code> — élément qui accueille l’artefact</li>
                  <li><code>data-transparent</code> — fond transparent</li>
                  <li><code>data-open-link="false"</code> — pas de lien vers la page de l’artefact</li>
                </ul>
              </details>
            `}
      </section>
    `;
  }

  private renderSkeleton() {
    return html`
      <div class="page" aria-busy="true">
        <div class="titles">
          <span class="skeleton" style="width: 7rem"></span>
          <span class="skeleton" style="width: min(20rem, 70%); height: 1.75rem; margin-top: 0.5rem"></span>
        </div>
        <div class="panel panel-pad form">
          ${[0, 1, 2].map(() => html`<span class="skeleton" style="height: 2.5rem"></span>`)}
        </div>
      </div>
    `;
  }

  render() {
    if (this.loading && !this.artifactId) return this.renderSkeleton();
    if (!this.artifactId && this.error) {
      return html`
        <div class="page page-narrow">
          <a class="crumb" href="/admin" @click=${(e: Event) => this.back(e)}>
            <sonic-icon library="custom" name="nav-arrow-left" size="sm"></sonic-icon>
            Bibliothèque
          </a>
          <div class="notice" data-tone="danger" role="alert">
            <sonic-icon library="custom" name="warning-triangle" size="sm"></sonic-icon>
            <span class="grow">${this.error}</span>
          </div>
        </div>
      `;
    }

    const dirty = this.dirty();

    return html`
      <div class="page" formDataProvider=${artifactEditFormKey.path}>
        <div class="page-head">
          <div class="titles">
            <a class="crumb" href="/admin" @click=${(e: Event) => this.back(e)}>
              <sonic-icon library="custom" name="nav-arrow-left" size="sm"></sonic-icon>
              Bibliothèque
            </a>
            <h1>${this.heading || this.slug}</h1>
            <p class="slug-line">
              <code>/${this.slug}</code>
              <span class="pill" data-tone=${this.visibility}
                >${VISIBILITY_LABELS[this.visibility]?.label ?? this.visibility}</span
              >
              ${this.updatedAt
                ? html`<span>Modifié le <time datetime=${this.updatedAt}>${fullDate(this.updatedAt)}</time></span>`
                : nothing}
            </p>
          </div>
          <div class="actions">
            <sonic-button
              size="sm"
              variant="outline"
              @click=${() => window.open(`/${this.slug}/`, "_blank", "noopener,noreferrer")}
            >
              <sonic-icon slot="prefix" library="custom" name="open-new-window" size="sm"></sonic-icon>
              Ouvrir
            </sonic-button>
            <sonic-button size="sm" variant="outline" @click=${() => navigate(`/admin/${this.slug}/atelier`)}>
              <sonic-icon slot="prefix" library="custom" name="chat-bubble" size="sm"></sonic-icon>
              Atelier
            </sonic-button>
            <sonic-button size="sm" variant="outline" @click=${() => navigate(`/admin/${this.slug}/versions`)}>
              <sonic-icon slot="prefix" library="custom" name="clock" size="sm"></sonic-icon>
              Versions
            </sonic-button>
          </div>
        </div>

        ${this.error
          ? html`<div class="notice" data-tone="danger" role="alert">
              <sonic-icon library="custom" name="warning-triangle" size="sm"></sonic-icon>
              <span class="grow">${this.error}</span>
            </div>`
          : nothing}
        ${this.saved && !dirty
          ? html`<div class="notice" data-tone="success" role="status">
              <sonic-icon library="custom" name="check" size="sm"></sonic-icon>
              <span class="grow">Modifications enregistrées.</span>
            </div>`
          : nothing}

        <div class="layout">
          <form class="panel panel-pad form" @submit=${(e: Event) => this.save(e)} novalidate>
            <label class="field">
              <span class="label">Titre</span>
              <sonic-input name="title" required></sonic-input>
            </label>
            <label class="field">
              <span class="label">Description</span>
              <sonic-input name="description" type="textarea" rows="3"></sonic-input>
              <span class="hint">Affichée dans la bibliothèque et à la recherche.</span>
            </label>
            <label class="field">
              <span class="label">Slug</span>
              <sonic-input name="slug" required></sonic-input>
              <span class="hint">
                Adresse : <code>/${this.form?.slug || this.slug}</code>. Si vous le changez, l’ancien lien
                ne mène plus à l’artefact.
              </span>
            </label>
            <fieldset class="field">
              <legend class="label">Visibilité</legend>
              <div class="choices" role="radiogroup" aria-label="Visibilité">
                ${(["public", "link", "private"] as const).map(
                  (k) => html`
                    <button
                      type="button"
                      role="radio"
                      class="choice"
                      aria-checked=${this.form?.visibility === k ? "true" : "false"}
                      @click=${() => this.setVisibility(k)}
                    >
                      <span class="choice-title">
                        ${VISIBILITY_LABELS[k].label}
                        ${this.form?.visibility === k
                          ? html`<sonic-icon library="custom" name="check" size="xs"></sonic-icon>`
                          : nothing}
                      </span>
                      <span class="choice-hint">${VISIBILITY_LABELS[k].hint}</span>
                    </button>
                  `,
                )}
              </div>
            </fieldset>
            <div class="form-actions">
              <sonic-button
                type="primary"
                ?disabled=${!dirty || this.saving}
                ?loading=${this.saving}
                @click=${(e: Event) => this.save(e)}
              >
                ${this.saving ? "Enregistrement…" : "Enregistrer"}
              </sonic-button>
              <sonic-button variant="ghost" @click=${() => navigate("/admin")}>
                ${dirty ? "Abandonner" : "Retour"}
              </sonic-button>
            </div>
          </form>

          ${this.renderEmbed()}
        </div>
      </div>
    `;
  }

  private back(e: Event) {
    e.preventDefault();
    navigate("/admin");
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "artifact-edit-page": ArtifactEditPage;
  }
}
