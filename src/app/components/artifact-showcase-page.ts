import "@supersoniks/concorde/button";
import "@supersoniks/concorde/icon";
import "@supersoniks/concorde/input";
import "@supersoniks/concorde/textarea";
import "@supersoniks/concorde/fieldset";
import "@supersoniks/concorde/legend";
import "@supersoniks/concorde/form-layout";
import "@supersoniks/concorde/modal";
import "@supersoniks/concorde/modal-title";
import "@supersoniks/concorde/modal-content";
import "@supersoniks/concorde/modal-actions";
import {css, html, LitElement, nothing} from "lit";
import {customElement, state} from "lit/decorators.js";
import {repeat} from "lit/directives/repeat.js";
import {dp, set} from "@supersoniks/concorde/utils";
import {handle} from "@supersoniks/concorde/decorators";
import {uiStyles, VISIBILITY_LABELS} from "../styles/ui";
import {loadArtifactsAccount} from "../cloud/account";
import {
  cloudReturnUrl,
  createRecord,
  fetchPublicCollection,
  getArtifact,
  getAccountRights,
  ApiError,
  listMyArtifacts,
  listRecords,
  patchArtifact,
  tadaaaLoginUrl,
  updateRecord,
  type ArtifactSummary,
} from "../cloud/client";
import {explainFetchError, loadApiBaseUrl} from "../cloud/api-base";
import {
  DEFAULT_SHOWCASE,
  iconUrl,
  pickShowcaseRecord,
  SHOWCASE_COLLECTION,
  SHOWCASE_MAX,
  SHOWCASE_SLUG,
  type Showcase,
  type ShowcaseEntry,
} from "../featured";
import {
  emptyShowcaseFilter,
  showcaseCardFormKey,
  showcaseFilterKey,
  type ShowcaseCardForm,
  type ShowcaseFilter,
} from "../dp";
import "./artifact-filter-bar";
import type {FilterSelectConfig} from "./artifact-filter-bar";

const VISIBILITY_OPTS = [
  {value: "all", label: "Toutes"},
  {value: "public", label: "Public"},
  {value: "link", label: "Lien"},
  {value: "private", label: "Privé"},
] as const;

const PLACE_OPTS = [
  {value: "all", label: "Tous"},
  {value: "on", label: "Sur l’accueil"},
  {value: "off", label: "Pas sur l’accueil"},
] as const;

/** Libellé court proposé à l'ajout : premier segment du titre (« Abysse — dessin… » → « Abysse »). */
function shortTitle(title: string): string {
  return (title.split(/\s+[—·:|-]\s+/)[0] || title).slice(0, 60);
}

/**
 * Vitrine de l'accueil (super admin) : choisir les artefacts montrés sur la page d'accueil, leur ordre,
 * leur texte de carte et celui qui passe « à la une ». La sélection est un enregistrement de la collection
 * `vitrine` de l'artefact `accueil-vitrine`, que l'accueil lit sans compte.
 */
@customElement("artifact-showcase-page")
export class ArtifactShowcasePage extends LitElement {
  static styles = [
    uiStyles,
    css`
      .cols {
        display: grid;
        gap: var(--ui-6);
        align-items: start;
      }
      @media (min-width: 1100px) {
        .cols {
          grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
        }
      }
      h2 {
        font-size: var(--ui-fs-lg, 1.125rem);
        margin: 0 0 var(--ui-3);
      }
      .rows {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
      }
      .row {
        display: grid;
        grid-template-columns: 2.5rem minmax(0, 1fr) auto;
        gap: var(--ui-3);
        align-items: center;
        padding: var(--ui-3) var(--ui-4);
        border-top: 1px solid var(--ui-line);
      }
      .row:first-child {
        border-top: 0;
      }
      .row[data-une] {
        background: var(--ui-selected);
      }
      .row img {
        width: 2.5rem;
        height: 2.5rem;
        border-radius: calc(var(--ui-radius) * 0.75);
      }
      .who {
        min-width: 0;
      }
      .who strong {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .who small {
        display: block;
        color: var(--ui-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .tools {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        align-items: center;
        gap: var(--ui-1);
      }
      .une {
        display: inline-flex;
        align-items: center;
        gap: var(--ui-1);
        padding: var(--ui-1) var(--ui-3);
        border: 1px solid var(--ui-line);
        border-radius: 999px;
        background: transparent;
        color: inherit;
        font: inherit;
        font-size: var(--ui-fs-sm);
        cursor: pointer;
      }
      .une[aria-checked="true"] {
        border-color: currentColor;
        background: var(--sc-accent, var(--ui-hover));
        color: var(--sc-accent-content, inherit);
        font-weight: 600;
      }
      artifact-filter-bar {
        display: block;
        margin-bottom: var(--ui-3);
      }
      .toast {
        position: fixed;
        inset-block-end: calc(var(--ui-6) + env(safe-area-inset-bottom));
        inset-inline: 0;
        width: fit-content;
        margin-inline: auto;
        max-width: calc(100vw - 2rem);
        padding: var(--ui-2) var(--ui-4);
        border-radius: 9999px;
        background: var(--sc-base-content);
        color: var(--sc-base);
        font-size: var(--ui-fs-sm);
        font-weight: 500;
        box-shadow: var(--ui-shadow-pop);
        z-index: 5;
      }
      @media (max-width: 767px) {
        .toast {
          inset-block-end: calc(4.5rem + env(safe-area-inset-bottom));
        }
      }
    `,
  ];

  @state() private filter: ShowcaseFilter = emptyShowcaseFilter();

  /**
   * Recherche (sonic-input du filtre) et menus écrivent dans le DataProvider, champ par champ : un
   * abonnement à la racine ne voit pas l'écriture de `q` par le champ, d'où une écoute par clé.
   */
  @handle(showcaseFilterKey.q)
  onQuery(v: string | null | undefined): void {
    this.filter = {...this.filter, q: v ?? ""};
  }

  @handle(showcaseFilterKey.visibility)
  onVisibility(v: string | null | undefined): void {
    this.filter = {...this.filter, visibility: v || "all"};
  }

  @handle(showcaseFilterKey.place)
  onPlace(v: string | null | undefined): void {
    this.filter = {...this.filter, place: v || "all"};
  }

  @state() private allowed: boolean | null = null;
  /** Admin dont le compte n'est pas membre du jeu de données de `accueil-vitrine` : lecture et écriture refusées. */
  @state() private noAccess = false;
  @state() private loading = true;
  @state() private error = "";
  @state() private saving = false;
  @state() private toast = "";
  @state() private artifacts: ArtifactSummary[] = [];
  @state() private showcase: Showcase = DEFAULT_SHOWCASE;
  /** Sélection telle qu'enregistrée : sert à savoir s'il reste quelque chose à enregistrer. */
  @state() private saved = "";
  /** Carte ouverte dans la modale de réglage. */
  @state() private editing: string | null = null;
  /** Artefact non public dont on confirme le passage en public. */
  @state() private confirmPublic: ArtifactSummary | null = null;

  private vitrineId = "";
  private recordId = "";
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  /** Chaque changement est publié tout seul, peu après le dernier geste. */
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private saveAgain = false;

  connectedCallback(): void {
    super.connectedCallback();
    dp(showcaseFilterKey);
    if (!dp(showcaseFilterKey).get()) set(showcaseFilterKey, emptyShowcaseFilter());
    dp(showcaseCardFormKey);
    window.addEventListener("beforeunload", this.onBeforeUnload);
    void this.start();
  }

  disconnectedCallback(): void {
    clearTimeout(this.toastTimer);
    window.removeEventListener("beforeunload", this.onBeforeUnload);
    if (this.dirty) void this.save();
    super.disconnectedCallback();
  }

  private async start(): Promise<void> {
    // Page remontée par le routeur (navigation interne) : on garde la sélection en cours au lieu de relire
    // l'enregistrement, qui écraserait des changements pas encore partis.
    if (this.vitrineId) return;
    if (!loadArtifactsAccount()) {
      this.allowed = false;
      this.loading = false;
      return;
    }
    this.allowed = (await getAccountRights()).admin;
    if (this.allowed) await this.load();
    else this.loading = false;
  }

  private async load(): Promise<void> {
    this.loading = true;
    this.error = "";
    try {
      const [list, vitrine] = await Promise.all([listMyArtifacts(), getArtifact(SHOWCASE_SLUG)]);
      this.artifacts = list.filter((a) => a.slug !== SHOWCASE_SLUG);
      this.vitrineId = vitrine.id;
      const rec = pickShowcaseRecord(await listRecords(vitrine.id, SHOWCASE_COLLECTION));
      this.recordId = rec?.id ?? "";
      this.showcase = rec?.showcase ?? DEFAULT_SHOWCASE;
      this.saved = rec ? JSON.stringify(rec.showcase) : "";
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 404)) this.noAccess = true;
      else this.error = explainFetchError(e, loadApiBaseUrl());
    } finally {
      this.loading = false;
    }
  }

  private get dirty(): boolean {
    return JSON.stringify(this.showcase) !== this.saved;
  }

  private flash(text: string): void {
    this.toast = text;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ""), 2600);
  }

  /** Un changement pas encore arrivé sur l'accueil : le navigateur demande confirmation avant de quitter. */
  private onBeforeUnload = (e: BeforeUnloadEvent): void => {
    if (this.dirty || this.saving) e.preventDefault();
  };

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.save(), 400);
  }

  /**
   * Publie la sélection puis la relit comme l'accueil la lit (lecture publique) : un écart est signalé
   * au lieu d'annoncer une publication qui n'a pas eu lieu.
   */
  private async save(): Promise<void> {
    clearTimeout(this.saveTimer);
    if (!this.vitrineId) return;
    if (this.saving) {
      this.saveAgain = true;
      return;
    }
    this.saving = true;
    this.error = "";
    const data = this.showcase;
    const sent = JSON.stringify(data);
    try {
      if (this.recordId) await updateRecord(this.vitrineId, SHOWCASE_COLLECTION, this.recordId, data);
      else this.recordId = (await createRecord(this.vitrineId, SHOWCASE_COLLECTION, data)).id;
      const back = pickShowcaseRecord(await fetchPublicCollection(SHOWCASE_SLUG, SHOWCASE_COLLECTION));
      if (!back || JSON.stringify(back.showcase) !== sent) {
        this.error = "L’accueil ne montre pas encore cette sélection : elle a été envoyée mais pas relue à l’identique.";
      } else {
        this.saved = sent;
        if (JSON.stringify(this.showcase) === sent) this.flash("Accueil mis à jour");
      }
    } catch (e) {
      this.error = explainFetchError(e, loadApiBaseUrl());
    } finally {
      this.saving = false;
    }
    if (this.saveAgain || (this.dirty && !this.error)) {
      this.saveAgain = false;
      void this.save();
    }
  }

  private setItems(items: ShowcaseEntry[], une = this.showcase.une): void {
    this.showcase = {items, une: une && items.some((e) => e.slug === une) ? une : null};
    this.scheduleSave();
  }

  private add(a: ArtifactSummary): void {
    const {items} = this.showcase;
    if (items.some((e) => e.slug === a.slug) || items.length >= SHOWCASE_MAX) return;
    this.setItems([...items, {slug: a.slug, title: shortTitle(a.title || a.slug), kind: "", blurb: (a.description ?? "").slice(0, 160)}]);
    this.flash(`${shortTitle(a.title || a.slug)} ajouté à la vitrine`);
  }

  private drop(slug: string): void {
    this.setItems(this.showcase.items.filter((e) => e.slug !== slug));
  }

  private move(slug: string, by: number): void {
    const items = [...this.showcase.items];
    const i = items.findIndex((e) => e.slug === slug);
    const j = i + by;
    if (i < 0 || j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    this.setItems(items);
  }

  private toggleUne(slug: string): void {
    this.setItems(this.showcase.items, this.showcase.une === slug ? null : slug);
  }

  private openEdit(e: ShowcaseEntry): void {
    set(showcaseCardFormKey, {title: e.title, kind: e.kind, blurb: e.blurb});
    this.editing = e.slug;
  }

  private applyEdit(): void {
    const f = dp(showcaseCardFormKey).get() as ShowcaseCardForm | undefined;
    const slug = this.editing;
    this.editing = null;
    if (!f || !slug) return;
    this.setItems(
      this.showcase.items.map((e) =>
        e.slug === slug
          ? {...e, title: (f.title ?? "").trim().slice(0, 60) || e.title, kind: (f.kind ?? "").trim().slice(0, 24), blurb: (f.blurb ?? "").trim().slice(0, 160)}
          : e,
      ),
    );
  }

  /** Un artefact « par lien » ou privé n'est pas lisible depuis l'accueil : il passe en public, puis entre. */
  private async publishAndAdd(a: ArtifactSummary): Promise<void> {
    this.confirmPublic = null;
    this.error = "";
    try {
      const updated = await patchArtifact(a.id, {visibility: "public"});
      this.artifacts = this.artifacts.map((x) => (x.id === a.id ? {...x, ...updated} : x));
      this.add({...a, ...updated});
    } catch (e) {
      this.error = explainFetchError(e, loadApiBaseUrl());
    }
  }

  private selects(): FilterSelectConfig[] {
    const f = this.filter ?? emptyShowcaseFilter();
    const vis = VISIBILITY_OPTS.find((o) => o.value === f.visibility) ?? VISIBILITY_OPTS[0];
    const place = PLACE_OPTS.find((o) => o.value === f.place) ?? PLACE_OPTS[0];
    return [
      {name: "visibility", label: "Visibilité", triggerLabel: vis.value === "all" ? "Visibilité" : vis.label, icon: "eye", options: VISIBILITY_OPTS, value: f.visibility, defaultValue: "all"},
      {name: "place", label: "Accueil", triggerLabel: place.value === "all" ? "Accueil" : place.label, icon: "home", options: PLACE_OPTS, value: f.place, defaultValue: "all"},
    ];
  }

  private onSelect = (e: Event): void => {
    const {name, value} = (e as CustomEvent<{name: string; value: string}>).detail;
    set(showcaseFilterKey, {...emptyShowcaseFilter(), ...(this.filter ?? {}), [name]: value});
  };

  private filtered(): ArtifactSummary[] {
    const f = this.filter ?? emptyShowcaseFilter();
    const q = (f.q ?? "").trim().toLowerCase();
    const on = new Set(this.showcase.items.map((e) => e.slug));
    return this.artifacts.filter(
      (a) =>
        (f.visibility === "all" || !f.visibility || a.visibility === f.visibility) &&
        (f.place !== "on" || on.has(a.slug)) &&
        (f.place !== "off" || !on.has(a.slug)) &&
        (!q || `${a.title} ${a.slug} ${a.description ?? ""}`.toLowerCase().includes(q)),
    );
  }

  private pill(visibility: string) {
    const v = VISIBILITY_LABELS[visibility];
    return html`<span class="pill" data-tone=${visibility} title=${v?.hint ?? ""}>${v?.label ?? visibility}</span>`;
  }

  private renderSelected() {
    const {items, une} = this.showcase;
    const bySlug = new Map(this.artifacts.map((a) => [a.slug, a]));
    if (!items.length) {
      return html`<div class="panel empty"><h2>Vitrine vide</h2><p>L’accueil montre alors sa sélection par défaut.</p></div>`;
    }
    return html`<ul class="panel rows">
      ${repeat(
        items,
        (e) => e.slug,
        (e, i) => {
          const a = bySlug.get(e.slug);
          return html`<li class="row" ?data-une=${une === e.slug} data-slug=${e.slug}>
            <img src=${iconUrl(e.slug)} alt="" loading="lazy" />
            <div class="who">
              <strong>${e.title}</strong>
              <small>${[e.kind || a?.tags?.[0]?.name, e.blurb].filter(Boolean).join(" · ") || e.slug}</small>
              ${a && a.visibility !== "public" ? this.pill(a.visibility) : nothing}
            </div>
            <div class="tools">
              <button type="button" class="une" role="radio" aria-checked=${une === e.slug ? "true" : "false"} title="À la une" @click=${() => this.toggleUne(e.slug)}>
                <sonic-icon library="custom" name="star" size="xs"></sonic-icon>
                À la une
              </button>
              <sonic-button type="default" variant="ghost" shape="circle" size="sm" aria-label="Monter" ?disabled=${i === 0} @click=${() => this.move(e.slug, -1)}>
                <sonic-icon library="custom" name="nav-arrow-up" size="sm"></sonic-icon>
              </sonic-button>
              <sonic-button type="default" variant="ghost" shape="circle" size="sm" aria-label="Descendre" ?disabled=${i === items.length - 1} @click=${() => this.move(e.slug, 1)}>
                <sonic-icon library="custom" name="nav-arrow-down" size="sm"></sonic-icon>
              </sonic-button>
              <sonic-button type="default" variant="ghost" shape="circle" size="sm" aria-label="Modifier la carte" @click=${() => this.openEdit(e)}>
                <sonic-icon library="custom" name="edit-pencil" size="sm"></sonic-icon>
              </sonic-button>
              <sonic-button type="danger" variant="ghost" shape="circle" size="sm" aria-label="Retirer de la vitrine" @click=${() => this.drop(e.slug)}>
                <sonic-icon library="custom" name="xmark" size="sm"></sonic-icon>
              </sonic-button>
            </div>
          </li>`;
        },
      )}
    </ul>`;
  }

  private renderCatalogue() {
    const list = this.filtered();
    const on = new Set(this.showcase.items.map((e) => e.slug));
    const full = this.showcase.items.length >= SHOWCASE_MAX;
    return html`
      <artifact-filter-bar searchPlaceholder="Titre, slug ou description…" .selects=${this.selects()} @select-change=${this.onSelect}></artifact-filter-bar>
      ${list.length
        ? html`<ul class="panel rows">
            ${repeat(
              list,
              (a) => a.id,
              (a) => html`<li class="row" data-slug=${a.slug}>
                <img src=${iconUrl(a.slug)} alt="" loading="lazy" />
                <div class="who">
                  <strong>${a.title || a.slug}</strong>
                  <small>/${a.slug}</small>
                </div>
                <div class="tools">
                  ${this.pill(a.visibility)}
                  ${on.has(a.slug)
                    ? html`<sonic-button size="sm" variant="outline" @click=${() => this.drop(a.slug)}>Retirer</sonic-button>`
                    : html`<sonic-button
                        size="sm"
                        type="primary"
                        variant="outline"
                        ?disabled=${full}
                        @click=${() => (a.visibility === "public" ? this.add(a) : (this.confirmPublic = a))}
                        >Ajouter</sonic-button
                      >`}
                </div>
              </li>`,
            )}
          </ul>`
        : html`<div class="panel empty"><h2>Aucun artefact</h2><p>Rien ne correspond à ces filtres.</p></div>`}
    `;
  }

  private renderEditModal() {
    return html`<sonic-modal maxWidth="min(100vw, 34rem)" .visible=${!!this.editing} @hidden=${() => (this.editing = null)}>
      <sonic-modal-title>Carte de l’accueil</sonic-modal-title>
      <sonic-modal-content>
        <form formDataProvider=${showcaseCardFormKey.path} @submit=${(e: Event) => (e.preventDefault(), this.applyEdit())}>
          <sonic-fieldset variant="ghost" tight>
            <sonic-legend label="Texte de la carte" description=${this.editing ? `/${this.editing}` : ""}></sonic-legend>
            <sonic-form-layout>
              <sonic-input name="title" label="Titre" maxlength="60" required></sonic-input>
              <sonic-input name="kind" label="Genre (vide : catégorie de l’artefact)" maxlength="24"></sonic-input>
              <sonic-textarea name="blurb" label="Phrase d’accroche" rows="3" maxlength="160"></sonic-textarea>
            </sonic-form-layout>
          </sonic-fieldset>
        </form>
      </sonic-modal-content>
      <sonic-modal-actions>
        <sonic-button variant="ghost" @click=${() => (this.editing = null)}>Annuler</sonic-button>
        <sonic-button type="primary" @click=${() => this.applyEdit()}>Valider</sonic-button>
      </sonic-modal-actions>
    </sonic-modal>`;
  }

  private renderPublicModal() {
    const a = this.confirmPublic;
    return html`<sonic-modal maxWidth="min(100vw, 30rem)" .visible=${!!a} @hidden=${() => (this.confirmPublic = null)}>
      <sonic-modal-title>Rendre public ?</sonic-modal-title>
      <sonic-modal-content>
        <p>
          « ${a?.title ?? ""} » est ${a?.visibility === "link" ? "visible seulement avec son lien" : "privé"}. Pour être sur
          l’accueil, il doit passer en public : tout le monde pourra l’ouvrir.
        </p>
      </sonic-modal-content>
      <sonic-modal-actions>
        <sonic-button variant="ghost" @click=${() => (this.confirmPublic = null)}>Annuler</sonic-button>
        <sonic-button type="primary" @click=${() => a && void this.publishAndAdd(a)}>Rendre public et ajouter</sonic-button>
      </sonic-modal-actions>
    </sonic-modal>`;
  }

  render() {
    if (this.noAccess) {
      return html`
        <div class="page page-narrow">
          <h1>Vitrine</h1>
          <div class="panel empty">
            <h2>Pas d’accès à la vitrine</h2>
            <p>La sélection est rangée dans l’artefact <code>/${SHOWCASE_SLUG}</code>, qui appartient à un autre compte. Il faut être membre de son jeu de données pour la modifier.</p>
          </div>
        </div>
      `;
    }
    if (this.allowed === false) {
      const connected = !!loadArtifactsAccount();
      return html`
        <div class="page page-narrow">
          <h1>Vitrine</h1>
          <div class="panel empty">
            <h2>${connected ? "Réservé aux administrateurs" : "Connectez-vous"}</h2>
            <p>Le choix des artefacts montrés sur l’accueil est réservé aux comptes administrateurs.</p>
            ${connected
              ? nothing
              : html`<sonic-button type="primary" @click=${() => location.assign(tadaaaLoginUrl(cloudReturnUrl("/admin/vitrine")))}>Se connecter avec Tadaaa</sonic-button>`}
          </div>
        </div>
      `;
    }
    const {items, une} = this.showcase;
    const uneTitle = items.find((e) => e.slug === une)?.title;
    return html`
      <div class="page" formDataProvider=${showcaseFilterKey.path} dataFilterProvider=${showcaseFilterKey.path}>
        <div class="page-head">
          <div class="titles">
            <h1>Vitrine de l’accueil</h1>
            <p class="sub" aria-live="polite">
              ${this.loading
                ? "Chargement…"
                : `${items.length} artefact${items.length > 1 ? "s" : ""} sur l’accueil · ${uneTitle ? `à la une : ${uneTitle}` : "aucun à la une"}`}
            </p>
          </div>
          <div class="actions">
            <sonic-button size="sm" variant="outline" href="/" target="_blank">
              <sonic-icon slot="prefix" library="custom" name="open-new-window" size="sm"></sonic-icon>
              Voir l’accueil
            </sonic-button>
            <sonic-button size="sm" type="primary" data-save ?disabled=${this.loading || this.saving || !this.dirty} @click=${() => void this.save()}>
              ${this.saving ? "Publication…" : this.dirty ? "Publier maintenant" : "Accueil à jour"}
            </sonic-button>
          </div>
        </div>
        ${this.error ? html`<div class="notice" data-tone="danger" role="alert">${this.error}</div>` : nothing}
        ${this.loading
          ? nothing
          : html`<div class="cols">
              <section aria-labelledby="sel-title">
                <h2 id="sel-title">Sur l’accueil, dans l’ordre</h2>
                ${this.renderSelected()}
              </section>
              <section aria-labelledby="all-title">
                <h2 id="all-title">Vos artefacts</h2>
                ${this.renderCatalogue()}
              </section>
            </div>`}
        ${this.renderEditModal()} ${this.renderPublicModal()}
        <p class=${this.toast ? "toast" : "sr-only"} role="status">${this.toast}</p>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "artifact-showcase-page": ArtifactShowcasePage;
  }
}
