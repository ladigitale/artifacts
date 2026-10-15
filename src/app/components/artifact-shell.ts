import "@supersoniks/concorde/icon";
import "@supersoniks/concorde/pop";
import {css, html, LitElement, nothing} from "lit";
import {customElement, state} from "lit/decorators.js";
import {clearArtifactsAccount, loadArtifactsAccount} from "../cloud/account";
import {navigate} from "../navigate";
import {hidePop, uiStyles} from "../styles/ui";
import "./artifact-logo";
import "./artifact-theme-switcher";

type NavId = "library" | "atelier" | "account";

/** Section active, déduite de l'URL. */
function sectionOf(path: string): NavId | null {
  if (path.startsWith("/cloud")) return "account";
  if (path === "/admin/atelier" || /^\/admin\/[^/]+\/atelier\/?$/.test(path)) return "atelier";
  if (path === "/admin" || path.startsWith("/admin/")) return "library";
  return null;
}

const NAV: {id: NavId; href: string; label: string; icon: string}[] = [
  {id: "library", href: "/admin", label: "Bibliothèque", icon: "folder"},
  {id: "atelier", href: "/admin/atelier", label: "Atelier", icon: "chat-bubble"},
  {id: "account", href: "/cloud", label: "Compte", icon: "user"},
];

/**
 * Coque des pages connectées.
 *
 * Bureau : barre haute (logo · Bibliothèque · Atelier ··· thème · compte). Le compte vit dans
 * son menu, pas dans la navigation.
 * Mobile : barre haute réduite (logo · thème) et barre d'onglets en bas, à portée de pouce.
 * L'atelier prend tout le cadre (pas de gouttières), les autres pages sont bornées à 72rem.
 */
@customElement("artifact-shell")
export class ArtifactShell extends LitElement {
  static styles = [
    uiStyles,
    css`
      :host {
        display: block;
        height: 100%;
        min-height: 0;
      }
      .app {
        height: 100%;
        min-height: 0;
        display: flex;
        flex-direction: column;
        background: var(--sc-base-50);
      }
      header {
        flex: none;
        display: flex;
        align-items: center;
        gap: var(--ui-4);
        min-height: 3.5rem;
        padding: 0 var(--ui-4);
        background: var(--sc-base);
        border-bottom: 1px solid var(--ui-line);
      }
      .spacer {
        flex: 1;
      }
      .tools {
        display: flex;
        align-items: center;
        gap: var(--ui-1);
      }

      /* ───── Navigation haute (bureau) ───── */
      .nav-top {
        display: none;
        align-items: center;
        gap: var(--ui-1);
      }
      .nav-top a {
        display: inline-flex;
        align-items: center;
        gap: var(--ui-2);
        min-height: 2.5rem;
        padding: 0 var(--ui-3);
        border-radius: var(--ui-radius);
        color: var(--ui-muted);
        font-size: var(--ui-fs-sm);
        font-weight: 500;
        text-decoration: none;
        transition: background-color 0.15s, color 0.15s;
      }
      .nav-top a:hover {
        color: var(--sc-base-content);
        background: var(--ui-hover);
      }
      .nav-top a[aria-current="page"] {
        color: var(--sc-base-content);
        background: var(--ui-selected);
        font-weight: 600;
      }

      /* ───── Compte ───── */
      .account {
        display: none;
        align-items: center;
        gap: var(--ui-2);
        max-width: 16rem;
        min-height: 2.5rem;
        padding: 0 var(--ui-2) 0 var(--ui-1);
        border: 0;
        border-radius: 9999px;
        background: transparent;
        color: inherit;
        font: inherit;
        font-size: var(--ui-fs-sm);
        cursor: pointer;
        transition: background-color 0.15s;
      }
      .account:hover {
        background: var(--ui-hover);
      }
      .avatar {
        flex: none;
        display: inline-grid;
        place-items: center;
        width: 1.75rem;
        height: 1.75rem;
        border-radius: 50%;
        background: var(--sc-primary);
        color: var(--sc-primary-content);
        font-family: var(--sc-font-family-headings, inherit);
        font-size: var(--ui-fs-xs);
        font-weight: 700;
        text-transform: uppercase;
      }
      .account-email {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .menu {
        min-width: 15rem;
        padding: var(--ui-2);
        background: var(--sc-base);
        color: var(--sc-base-content);
        border: 1px solid var(--ui-line);
        border-radius: var(--ui-radius);
        box-shadow: var(--ui-shadow-pop);
      }
      .menu-who {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: var(--ui-2) var(--ui-3) var(--ui-3);
        border-bottom: 1px solid var(--ui-line);
        margin-bottom: var(--ui-2);
        font-size: var(--ui-fs-sm);
      }
      .menu-who small {
        color: var(--ui-muted);
      }
      .menu-who strong {
        overflow-wrap: anywhere;
      }
      .menu-item {
        display: flex;
        align-items: center;
        gap: var(--ui-3);
        width: 100%;
        min-height: 2.5rem;
        padding: 0 var(--ui-3);
        border: 0;
        border-radius: calc(var(--ui-radius) * 0.75);
        background: transparent;
        color: inherit;
        font: inherit;
        font-size: var(--ui-fs-sm);
        text-align: start;
        text-decoration: none;
        cursor: pointer;
      }
      .menu-item:hover {
        background: var(--ui-hover);
      }

      /* ───── Contenu ───── */
      main {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
        scrollbar-width: thin;
      }
      .content {
        width: 100%;
        max-width: var(--artifacts-content-max-width, 72rem);
        margin: 0 auto;
        padding: var(--ui-6) var(--ui-4) var(--ui-12);
      }
      /* Atelier : plein cadre, la page défile elle-même. */
      main[data-bleed] {
        overflow-y: hidden;
      }
      main[data-bleed] .content {
        max-width: none;
        height: 100%;
        padding: 0;
      }

      /* ───── Onglets (mobile) ───── */
      .nav-bottom {
        flex: none;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        background: var(--sc-base);
        border-top: 1px solid var(--ui-line);
        padding-bottom: env(safe-area-inset-bottom);
      }
      .nav-bottom a {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        min-height: 3.5rem;
        color: var(--ui-muted);
        font-size: var(--ui-fs-xs);
        font-weight: 500;
        text-decoration: none;
      }
      .nav-bottom a[aria-current="page"] {
        color: var(--sc-base-content);
        font-weight: 700;
        box-shadow: inset 0 2px 0 var(--sc-primary);
      }

      @media (min-width: 768px) {
        header {
          padding: 0 var(--ui-6);
          gap: var(--ui-6);
        }
        .nav-top {
          display: flex;
        }
        .account {
          display: inline-flex;
        }
        .nav-bottom {
          display: none;
        }
        .content {
          padding: var(--ui-8) var(--ui-6) var(--ui-12);
        }
        main[data-bleed] .content {
          padding: 0;
        }
      }

      @media print {
        header,
        .nav-bottom {
          display: none !important;
        }
        .app,
        main {
          height: auto !important;
          overflow: visible !important;
        }
        .content {
          max-width: none !important;
          padding: 0 !important;
        }
      }
    `,
  ];

  @state() private path = location.pathname;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("popstate", this.sync);
  }

  disconnectedCallback() {
    window.removeEventListener("popstate", this.sync);
    super.disconnectedCallback();
  }

  private sync = () => {
    this.path = location.pathname;
  };

  private go(path: string, e: Event) {
    // Clic modifié (nouvel onglet) : on laisse le navigateur faire.
    const m = e as MouseEvent;
    if (m.metaKey || m.ctrlKey || m.shiftKey || m.button) return;
    e.preventDefault();
    navigate(path);
    this.path = location.pathname;
  }

  private logout() {
    clearArtifactsAccount();
    navigate("/");
  }

  private link(item: (typeof NAV)[number], current: NavId | null) {
    return html`
      <a
        href=${item.href}
        aria-current=${item.id === current ? "page" : nothing}
        @click=${(e: Event) => this.go(item.href, e)}
      >
        <sonic-icon library="custom" name=${item.icon} size="sm"></sonic-icon>
        ${item.label}
      </a>
    `;
  }

  private renderAccount() {
    const account = loadArtifactsAccount();
    if (!account) {
      return html`<a class="menu-item" href="/cloud" @click=${(e: Event) => this.go("/cloud", e)}>
        Se connecter
      </a>`;
    }
    const email = account.user?.email ?? "Compte";
    return html`
      <sonic-pop placement="bottom-end" shadow="sm">
        <button type="button" class="account" aria-label=${`Menu du compte, ${email}`}>
          <span class="avatar" aria-hidden="true">${email.slice(0, 1)}</span>
          <span class="account-email">${email}</span>
          <sonic-icon library="custom" name="nav-arrow-down" size="xs"></sonic-icon>
        </button>
        <div slot="content" class="menu">
          <div class="menu-who">
            <small>Connecté avec Tadaaa</small>
            <strong>${email}</strong>
          </div>
          <a
            class="menu-item"
            href="/cloud"
            @click=${(e: Event) => {
              hidePop(e);
              this.go("/cloud", e);
            }}
          >
            <sonic-icon library="custom" name="user" size="sm"></sonic-icon>
            Compte
          </a>
          <button type="button" class="menu-item" @click=${() => this.logout()}>
            <sonic-icon library="custom" name="log-out" size="sm"></sonic-icon>
            Déconnexion
          </button>
        </div>
      </sonic-pop>
    `;
  }

  render() {
    const current = sectionOf(this.path);
    const bleed = current === "atelier";
    const [library, atelier, account] = NAV;
    return html`
      <div class="app">
        <header>
          <artifact-logo wordmark size="1.75rem" href="/"></artifact-logo>
          <nav class="nav-top" aria-label="Principal">
            ${this.link(library, current)} ${this.link(atelier, current)}
          </nav>
          <span class="spacer"></span>
          <div class="tools">
            <artifact-theme-switcher></artifact-theme-switcher>
            ${this.renderAccount()}
          </div>
        </header>
        <main class="custom-scroll" ?data-bleed=${bleed}>
          <div class="content"><slot></slot></div>
        </main>
        <nav class="nav-bottom" aria-label="Principal (mobile)">
          ${this.link(library, current)} ${this.link(atelier, current)} ${this.link(account, current)}
        </nav>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "artifact-shell": ArtifactShell;
  }
}
