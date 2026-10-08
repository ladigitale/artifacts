import "@supersoniks/concorde/button";
import "@supersoniks/concorde/icon";
import "@supersoniks/concorde/badge";
import "@supersoniks/concorde/divider";
import "@supersoniks/concorde/menu";
import "@supersoniks/concorde/pop";
import {html, css, type TemplateResult} from "lit";
import {loadArtifactsAccount, clearArtifactsAccount} from "../cloud/account";
import {navigate} from "../navigate";
import "../components/artifact-logo";
import "../components/artifact-theme-switcher";

const shellStyles = css`
  /* html/body sont en overflow:hidden : le shell occupe exactement l'écran
     et <main> porte le scroll (sinon le bas de page est inatteignable). */
  .app {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--sc-base-50, #e8e4f8);
  }
  header.bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--sc-base, #f4f2ff);
    border-bottom: 1px solid var(--sc-base-100);
    flex-shrink: 0;
  }
  .bar-start {
    display: flex;
    align-items: center;
    gap: 1rem;
    min-width: 0;
  }
  .bar-end {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }
  .nav-desktop {
    display: none;
    flex-wrap: nowrap;
    gap: 0.25rem;
  }
  .actions-desktop {
    display: none;
    align-items: center;
    gap: 0.75rem;
  }
  .nav-burger {
    display: inline-block;
  }
  .burger-panel {
    min-width: min(18rem, calc(100vw - 1.5rem));
    padding: 0.5rem;
    background: var(--sc-base);
    color: var(--sc-base-content);
    border: 1px solid var(--sc-base-100);
    border-radius: var(--sc-rounded, 0.25rem);
  }
  .burger-panel sonic-menu {
    width: 100%;
  }
  .burger-panel sonic-menu-item,
  .burger-panel sonic-button {
    width: 100%;
    justify-content: flex-start;
  }
  .burger-user {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.5rem 0.6rem;
  }
  main.shell-main {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
  }
  .shell-content {
    padding: 1rem 1rem 3rem;
    max-width: 72rem;
    width: 100%;
    margin: 0 auto;
    box-sizing: border-box;
  }
  @media (min-width: 768px) {
    header.bar {
      padding: 0.85rem 1.5rem;
    }
    .nav-desktop {
      display: flex;
    }
    .actions-desktop {
      display: flex;
    }
    .nav-burger {
      display: none;
    }
    .shell-content {
      padding: 1.5rem 1.5rem 3rem;
    }
  }
`;

function go(path: string, e?: Event) {
  e?.preventDefault();
  navigate(path);
}

function logout() {
  clearArtifactsAccount();
  navigate("/");
}

export function renderAdminShell(children: TemplateResult | unknown): TemplateResult {
  const account = loadArtifactsAccount();
  const email = account?.user?.email ?? "Compte";

  return html`
    <style>
      ${shellStyles}
    </style>
    <div class="app app-shell">
      <header class="bar app-shell-chrome print:hidden">
        <div class="bar-start">
          <artifact-logo wordmark size="1.75rem" href="/"></artifact-logo>
          <nav aria-label="Admin" class="nav-desktop">
            <sonic-button
              href="/admin"
              variant="ghost"
              size="sm"
              @click=${(e: Event) => go("/admin", e)}
            >
              <sonic-icon slot="prefix" library="custom" name="folder" size="sm"></sonic-icon>
              Bibliothèque
            </sonic-button>
            <sonic-button
              href="/cloud"
              variant="ghost"
              size="sm"
              @click=${(e: Event) => go("/cloud", e)}
            >
              <sonic-icon slot="prefix" library="custom" name="user" size="sm"></sonic-icon>
              Compte
            </sonic-button>
          </nav>
        </div>
        <div class="bar-end">
          <artifact-theme-switcher></artifact-theme-switcher>
          <div class="actions-desktop">
            <sonic-button
              href="/cloud"
              variant="ghost"
              size="sm"
              @click=${(e: Event) => go("/cloud", e)}
            >
              <sonic-icon slot="prefix" library="custom" name="user" size="xs"></sonic-icon>
              ${email}
            </sonic-button>
            ${account
              ? html`
                  <sonic-button variant="ghost" size="sm" @click=${() => logout()}>
                    <sonic-icon
                      slot="prefix"
                      library="custom"
                      name="log-out"
                      size="sm"
                    ></sonic-icon>
                    Déconnexion
                  </sonic-button>
                `
              : null}
          </div>
          <sonic-pop class="nav-burger" placement="bottom" shadow="sm">
            <sonic-button variant="ghost" size="sm" title="Menu" aria-label="Menu">
              <sonic-icon library="custom" name="menu" size="sm"></sonic-icon>
            </sonic-button>
            <div slot="content" class="burger-panel">
              <nav aria-label="Admin">
                <sonic-menu direction="column" align="left" size="sm">
                  <sonic-menu-item
                    href="/admin"
                    variant="ghost"
                    @click=${(e: Event) => go("/admin", e)}
                  >
                    <sonic-icon
                      slot="prefix"
                      library="custom"
                      name="folder"
                      size="sm"
                    ></sonic-icon>
                    Bibliothèque
                  </sonic-menu-item>
                  <sonic-menu-item
                    href="/cloud"
                    variant="ghost"
                    @click=${(e: Event) => go("/cloud", e)}
                  >
                    <sonic-icon
                      slot="prefix"
                      library="custom"
                      name="user"
                      size="sm"
                    ></sonic-icon>
                    Compte
                  </sonic-menu-item>
                </sonic-menu>
              </nav>
              <sonic-divider size="sm"></sonic-divider>
              <div class="burger-user">
                <sonic-badge type="info" variant="outline" size="sm">${email}</sonic-badge>
              </div>
              ${account
                ? html`
                    <sonic-button variant="ghost" size="sm" @click=${() => logout()}>
                      <sonic-icon
                        slot="prefix"
                        library="custom"
                        name="log-out"
                        size="sm"
                      ></sonic-icon>
                      Déconnexion
                    </sonic-button>
                  `
                : null}
            </div>
          </sonic-pop>
        </div>
      </header>
      <main class="shell-main app-shell-main custom-scroll">
        <div class="shell-content">${children}</div>
      </main>
    </div>
  `;
}
