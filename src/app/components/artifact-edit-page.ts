import "@supersoniks/concorde/button";
import "@supersoniks/concorde/icon";
import "@supersoniks/concorde/input";
import {html, LitElement, nothing} from "lit";
import {customElement, property, state} from "lit/decorators.js";
import {dp, set} from "@supersoniks/concorde/utils";
import tailwind from "../../css/tailwind";
import {formLabelStyles} from "../styles/form-label";
import {
  artifactEditFormKey,
  emptyArtifactEditForm,
  type ArtifactEditForm,
} from "../dp";
import {getArtifact, patchArtifact} from "../cloud/client";
import {loadArtifactsAccount} from "../cloud/account";
import {explainFetchError, loadApiBaseUrl} from "../cloud/api-base";
import {navigate} from "../navigate";

@customElement("artifact-edit-page")
export class ArtifactEditPage extends LitElement {
  static styles = [tailwind, formLabelStyles];

  @property({type: String}) slug = "";

  @state() private error = "";
  @state() private loading = true;
  @state() private saving = false;
  @state() private artifactId = "";
  @state() private visibility = "private";
  @state() private linkToken: string | null = null;
  @state() private copied = false;

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
      set(artifactEditFormKey, {
        title: a.title ?? "",
        description: a.description ?? "",
        slug: a.slug ?? "",
        visibility: a.visibility ?? "private",
      });
    } catch (e) {
      this.error = explainFetchError(e, loadApiBaseUrl());
    } finally {
      this.loading = false;
    }
  }

  private async save(e: Event) {
    e.preventDefault();
    const form = dp(artifactEditFormKey).get() as ArtifactEditForm | undefined;
    if (!form || !this.artifactId) return;
    this.saving = true;
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
      setTimeout(() => (this.copied = false), 1500);
    } catch {
      /* presse-papiers refusé : le texte reste sélectionnable */
    }
  }

  private renderEmbed() {
    if (this.visibility === "private") {
      return html`<p class="text-sm opacity-70 m-0">
        Passez l’artefact en « public » ou « link » pour l’intégrer sur un autre site.
      </p>`;
    }
    return html`
      <pre class="m-0 p-3 rounded-md text-xs overflow-x-auto whitespace-pre-wrap break-all"
        style="background:rgba(127,127,127,.12)"><code>${this.embedSnippet()}</code></pre>
      <p class="text-sm opacity-70 m-0">
        Options : <code>data-theme</code>, <code>data-view</code>, <code>data-height</code>,
        <code>data-target</code>, <code>data-transparent</code>, <code>data-open-link="false"</code>.
        ${this.visibility === "link" ? "Le jeton de lien est visible dans la page hôte." : ""}
      </p>
      <div>
        <sonic-button type="button" size="sm" variant="outline" @click=${() => this.copySnippet()}>
          ${this.copied ? "Copié" : "Copier la balise"}
        </sonic-button>
      </div>
    `;
  }

  render() {
    if (this.loading) return html`<p>Chargement…</p>`;

    return html`
      <div class="flex flex-col gap-4 max-w-xl" formDataProvider=${artifactEditFormKey.path}>
        <div class="flex items-center gap-3">
          <sonic-button
            type="button"
            size="sm"
            variant="ghost"
            @click=${() => navigate("/admin")}
          >
            ← Bibliothèque
          </sonic-button>
        </div>
        <h1 class="text-xl font-semibold m-0">Éditer — ${this.slug}</h1>
        ${this.error ? html`<p class="text-red-600 m-0">${this.error}</p>` : nothing}

        <form class="flex flex-col gap-4" @submit=${(e: Event) => this.save(e)}>
          <label class="form-field">
            <span class="form-label">Titre</span>
            <sonic-input name="title" required></sonic-input>
          </label>
          <label class="form-field">
            <span class="form-label">Description</span>
            <sonic-input name="description" type="textarea" rows="3"></sonic-input>
          </label>
          <label class="form-field">
            <span class="form-label">Slug</span>
            <sonic-input name="slug" required></sonic-input>
          </label>
          <fieldset class="form-field border-0 p-0 m-0">
            <span class="form-label">Visibilité</span>
            <div class="flex flex-wrap gap-2 mt-1">
              ${(["public", "link", "private"] as const).map(
                (v) => html`
                  <sonic-button unique name="visibility" value=${v} size="sm" variant="outline">
                    <sonic-icon
                      slot="prefix"
                      library="custom"
                      name="check"
                      size="xs"
                      swap="on"
                    ></sonic-icon>
                    ${v}
                  </sonic-button>
                `,
              )}
            </div>
          </fieldset>
          <div class="flex gap-2">
            <sonic-button type="submit" ?disabled=${this.saving}>
              ${this.saving ? "Enregistrement…" : "Enregistrer"}
            </sonic-button>
            <sonic-button type="button" variant="outline" @click=${() => navigate("/admin")}>
              Annuler
            </sonic-button>
          </div>
        </form>

        <section class="flex flex-col gap-2">
          <h2 class="text-lg font-semibold m-0">Intégrer sur un site</h2>
          ${this.renderEmbed()}
        </section>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "artifact-edit-page": ArtifactEditPage;
  }
}
