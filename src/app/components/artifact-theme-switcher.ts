import "@supersoniks/concorde/button";
import "@supersoniks/concorde/icon";
import "@supersoniks/concorde/pop";
import {html, LitElement, css} from "lit";
import {customElement, state} from "lit/decorators.js";
import tailwind from "../../css/tailwind";
import {applyTheme, loadStoredThemeId, saveThemeId} from "../appearance";

const THEMES = [
  {id: "default", label: "Clair"},
  {id: "dark", label: "Sombre"},
  {id: "nord", label: "Nord"},
] as const;

@customElement("artifact-theme-switcher")
export class ArtifactThemeSwitcher extends LitElement {
  static styles = [
    tailwind,
    css`
      :host {
        display: inline-block;
        vertical-align: middle;
      }
      .panel {
        min-width: 9rem;
        padding: 0.75rem;
        background: var(--sc-base);
        color: var(--sc-base-content);
        border: 1px solid var(--sc-base-100);
        border-radius: var(--sc-rounded, 0.25rem);
      }
      .list {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        margin-top: 0.45rem;
      }
      .list sonic-button {
        width: 100%;
        justify-content: flex-start;
      }
    `,
  ];

  @state() private themeId = loadStoredThemeId();

  private pick(id: string) {
    this.themeId = id;
    saveThemeId(id);
    applyTheme(id);
  }

  private label() {
    return THEMES.find((t) => t.id === this.themeId)?.label ?? "Thème";
  }

  render() {
    return html`
      <sonic-pop placement="bottom" shadow="sm">
        <sonic-button variant="ghost" size="sm" title="Thème" aria-label="Changer le thème">
          <sonic-icon slot="prefix" library="custom" name="half-moon" size="sm"></sonic-icon>
          <span class="hidden sm:inline">${this.label()}</span>
        </sonic-button>
        <div slot="content" class="panel">
          <div class="text-sm font-medium opacity-70">Apparence</div>
          <div class="list">
            ${THEMES.map(
              (t) => html`
                <sonic-button
                  type="button"
                  variant=${t.id === this.themeId ? "default" : "ghost"}
                  size="sm"
                  @click=${() => this.pick(t.id)}
                  >${t.label}</sonic-button
                >
              `,
            )}
          </div>
        </div>
      </sonic-pop>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "artifact-theme-switcher": ArtifactThemeSwitcher;
  }
}
