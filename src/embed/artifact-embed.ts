/**
 * Artefact embarquable sur n'importe quel site :
 *
 *   <script src="https://artifacts.tadaaa.space/embed.js" data-artifact="mon-slug" async></script>
 *
 * ou, en module, directement le web component :
 *
 *   <script type="module" src="https://artifacts.tadaaa.space/embed/artifact-embed.js"></script>
 *   <artifact-embed slug="mon-slug" theme="dark"></artifact-embed>
 *
 * Ce module est compilé à part (`LIB_NAME=embed vite build`, sortie `dist/embed/`) avec le
 * préfixe de composants `afx` : `sonic-button` devient `afx-button`, etc. Une page hôte qui
 * utilise déjà Concorde (autre version, autre PublisherManager) n'entre donc pas en conflit
 * avec l'artefact. Le document publié parle toujours `sonic-*` : il est réécrit à la volée
 * vers les noms réellement définis (`remapDocumentTags`).
 *
 * Isolation : shadow DOM (styles Tailwind + thème), DataProviders propres au bundle,
 * aucun accès à l'URL de la page hôte (vues internes, `k` / `rk` passés en attributs),
 * jamais de jeton de compte (lecture publique uniquement).
 */
import "./define-guard";
import "../app/concorde-sdui-runtime";
import "@supersoniks/concorde/sonic-scope";
import "@supersoniks/concorde/theme";
import "../app/components/artifact-viewer";
import {css, html, LitElement, nothing, unsafeCSS, type PropertyValues} from "lit";
import {customElement, property} from "lit/decorators.js";
import tailwind from "../css/tailwind";
import defaultThemeCss from "../css/default-theme.css?inline";
import themesCss from "../css/themes.css?inline";
import fontsCss from "../css/fonts.css?inline";
import {ICONOIR_CDN} from "../app/icons";
import {setEmbedApiBase} from "../app/cloud/api-base";
import {setDocumentTransform, setNamespaceResolver, type NamespaceClaim} from "../app/doc-transform";
import {isAddonTag} from "../app/addons";

/**
 * Noms effectifs après préfixage : ces littéraux sont réécrits par le plugin Concorde
 * (`sonic-theme` → `afx-theme` dans ce bundle). À l'inverse, `SOURCE_PREFIX` est
 * concaténé pour que le plugin ne le touche pas : c'est le préfixe des documents publiés.
 */
const THEME_TAG = "sonic-theme";
const SOURCE_PREFIX = "sonic" + "-";
const SOURCE_THEME_TAG = SOURCE_PREFIX + "theme";
const SCOPED_PREFIX = THEME_TAG.slice(0, -"theme".length);

/** Origine du viewer Artefacts (ce fichier est servi depuis `/embed/`). */
const VIEWER_ORIGIN = new URL(/* @vite-ignore */ "../", import.meta.url).href.replace(/\/$/, "");

/* --- Réécriture des tagNames du document ------------------------------------------- */

function remapTag(tag: unknown): unknown {
  if (typeof tag !== "string" || SCOPED_PREFIX === SOURCE_PREFIX) return tag;
  const lower = tag.toLowerCase();
  if (!lower.startsWith(SOURCE_PREFIX)) return tag;
  const scoped = SCOPED_PREFIX + lower.slice(SOURCE_PREFIX.length);
  // Seuls les composants préfixés à la compilation sont réécrits ; les autres
  // (sonic-store, sonic-patch… de la creative-stack) gardent leur nom. Les addons à la
  // demande ne sont pas encore définis : leur manifeste (préfixé lui aussi) fait foi.
  return customElements.get(scoped) || isAddonTag(scoped) ? scoped : tag;
}

function remapNode(value: unknown, depth = 0): unknown {
  if (depth > 64 || !value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => remapNode(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = k === "tagName" ? remapTag(v) : remapNode(v, depth + 1);
  }
  return out;
}

export function remapDocumentTags(doc: Record<string, unknown>): Record<string, unknown> {
  return remapNode(doc) as Record<string, unknown>;
}

/* --- Thème : feuilles de l'app réécrites pour le shadow root ----------------------- */

function scopeThemeCss(source: string): string {
  return source
    .split(SOURCE_THEME_TAG)
    .join(THEME_TAG)
    .replace(/html\[data-theme=(["']?)([\w-]+)\1\]/g, ':host([theme="$2"])')
    .replace(/:root\b/g, `:host, ${THEME_TAG}`);
}

/** Les @font-face ne s'appliquent pas depuis un shadow root : un <link> dans la page hôte. */
function ensureFonts(): void {
  const href = /@import\s+url\(\s*["']?([^"')]+)["']?\s*\)/.exec(fontsCss)?.[1];
  if (!href || document.querySelector("link[data-artifact-embed-fonts]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.artifactEmbedFonts = "";
  document.head.appendChild(link);
}

const scopedThemes = unsafeCSS(scopeThemeCss(defaultThemeCss) + "\n" + scopeThemeCss(themesCss));

type ThemeClass = {instance?: Element};

/* --- DataProviders : un préfixe par artefact en cas de collision -------------------- */

const claimed = new Map<string, number>();
let instanceCounter = 0;

function claim(slug: string, names: Set<string>): NamespaceClaim {
  const collides = [...names].some((n) => claimed.has(n));
  const ns = collides ? `${slug}~${++instanceCounter}:` : "";
  const keys = [...names].map((n) => ns + n);
  for (const k of keys) claimed.set(k, (claimed.get(k) ?? 0) + 1);
  return {
    ns,
    release: () => {
      for (const k of keys) {
        const c = (claimed.get(k) ?? 1) - 1;
        if (c > 0) claimed.set(k, c);
        else claimed.delete(k);
      }
    },
  };
}

/* Avant la définition du composant : des <artifact-embed> déjà présents sont mis à niveau
 * dès `customElements.define`. `__artifactsApiBase` (posé par embed.js via `data-api`)
 * sert au développement ; sinon l'API de la compilation (VITE_API_BASE_URL). */
setDocumentTransform(remapDocumentTags);
setNamespaceResolver(claim);
setEmbedApiBase((window as {__artifactsApiBase?: string}).__artifactsApiBase);

/* --- Composant ------------------------------------------------------------------- */

@customElement("artifact-embed")
export class ArtifactEmbed extends LitElement {
  static styles = [
    tailwind,
    scopedThemes,
    css`
      :host {
        display: block;
        position: relative;
        isolation: isolate;
        text-align: start;
        line-height: 1.2;
      }
      .frame {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        overflow: auto;
        background: var(--sc-base);
        color: var(--sc-base-content);
        font-family: var(--sc-font-family-base), sans-serif;
        border-radius: inherit;
      }
      :host([transparent]) .frame {
        background: transparent;
      }
      .frame > * {
        display: block;
      }
      .viewer {
        flex: 1 1 auto;
        min-height: 0;
      }
      .open {
        display: flex;
        justify-content: flex-end;
        padding: 0 0.75rem 0.5rem;
        font-size: 0.75rem;
        opacity: 0.6;
      }
      .open a {
        color: inherit;
      }
      .open a:hover,
      .open a:focus-visible {
        opacity: 1;
      }
    `,
  ];

  @property({type: String, reflect: true}) slug = "";
  /** Thème Artefacts (`dark`, `nord`, `terminal`…) ; absent = thème par défaut. */
  @property({type: String, reflect: true}) theme = "";
  /** Vue de départ (id d'une vue du document). */
  @property({type: String}) view = "";
  /** Jeton d'un artefact partagé « par lien » (`?k=`). */
  @property({type: String, attribute: "link-key"}) linkKey = "";
  /** Lien secret de lecture des collections (`?rk=`). */
  @property({type: String, attribute: "read-key"}) readKey = "";
  /** Hauteur fixe (`480px`, `60vh`…) ; sinon l'artefact prend sa hauteur naturelle. */
  @property({type: String}) height = "";
  /** Fond transparent (le thème garde ses couleurs de texte et de composants). */
  @property({type: Boolean, reflect: true}) transparent = false;
  /** `open-link="false"` masque le lien « Ouvrir dans Artefacts ». */
  @property({type: String, attribute: "open-link"}) openLink = "true";

  private currentView = "";

  connectedCallback(): void {
    super.connectedCallback();
    ensureFonts();
    // Popups / modales / tooltips Concorde : dans le thème de l'embed actif, pas dans <body>.
    this.addEventListener("pointerdown", this.adoptPopContainer, true);
    this.addEventListener("focusin", this.adoptPopContainer, true);
    this.addEventListener("artifact-view", this.onView as EventListener);
  }

  disconnectedCallback(): void {
    this.removeEventListener("pointerdown", this.adoptPopContainer, true);
    this.removeEventListener("focusin", this.adoptPopContainer, true);
    this.removeEventListener("artifact-view", this.onView as EventListener);
    super.disconnectedCallback();
  }

  protected firstUpdated(): void {
    this.adoptPopContainer();
  }

  protected updated(changed: PropertyValues<this>): void {
    if (changed.has("height")) this.style.height = this.height || "";
  }

  private adoptPopContainer = () => {
    const theme = this.renderRoot.querySelector(THEME_TAG);
    const Theme = customElements.get(THEME_TAG) as unknown as ThemeClass | undefined;
    if (theme && Theme) Theme.instance = theme;
  };

  private onView = (e: CustomEvent<{view: string}>) => {
    this.currentView = e.detail?.view ?? "";
    this.requestUpdate();
  };

  /** Page complète de l'artefact, avec les mêmes clés et la vue courante. */
  private fullPageUrl(): string {
    const url = new URL(`/${encodeURIComponent(this.slug)}/`, VIEWER_ORIGIN);
    if (this.linkKey) url.searchParams.set("k", this.linkKey);
    if (this.readKey) url.searchParams.set("rk", this.readKey);
    if (this.theme) url.searchParams.set("theme", this.theme);
    const view = this.currentView || this.view;
    if (view) url.hash = view;
    return url.toString();
  }

  render() {
    if (!this.slug.trim()) {
      return html`<p class="p-3 m-0">Artefact : attribut <code>slug</code> manquant.</p>`;
    }
    return html`
      <sonic-theme class="frame" color font>
        <sonic-scope
          class="viewer"
          customIconLibraryPath=${ICONOIR_CDN}
          customIconDefaultPrefix="regular"
        >
          <artifact-viewer
            embedded
            slug=${this.slug}
            view=${this.view}
            link-key=${this.linkKey}
            read-key=${this.readKey}
          ></artifact-viewer>
        </sonic-scope>
        ${this.openLink !== "false"
          ? html`<div class="open print:hidden">
              <a href=${this.fullPageUrl()} target="_blank" rel="noopener">Ouvrir dans Artefacts ↗</a>
            </div>`
          : nothing}
      </sonic-theme>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "artifact-embed": ArtifactEmbed;
  }
}
