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

  render() {
    if (this.loading) return html`<p>Chargement…</p>`;

    return html`
      <div class="flex flex-col gap-4 max-w-xl" formDataProvider=${artifactEditFormKey}>
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
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "artifact-edit-page": ArtifactEditPage;
  }
}
