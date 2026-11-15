import "@supersoniks/concorde/button";
import "@supersoniks/concorde/icon";
import "@supersoniks/concorde/pop";
import {css, html, LitElement} from "lit";
import {customElement, state} from "lit/decorators.js";
import {chooseTheme, loadStoredThemeId} from "../appearance";
import {uiStyles} from "../styles/ui";
import {THEMES, type ArtifactTheme} from "../themes";

type ThemeOption = ArtifactTheme;

@customElement("artifact-theme-switcher")
export class ArtifactThemeSwitcher extends LitElement {
  static styles = [
    uiStyles,
    css`
      :host {
        display: inline-block;
        vertical-align: middle;
      }
      .label {
        display: none;
      }
      @media (min-width: 640px) {
        .label {
          display: inline;
        }
      }
      .panel {
        width: min(19rem, calc(100vw - 1.5rem));
        max-height: min(30rem, 72vh);
        overflow-y: auto;
        padding: var(--ui-2);
        background: var(--sc-base);
        color: var(--sc-base-content);
        border: 1px solid var(--ui-line);
        border-radius: var(--ui-radius);
        box-shadow: var(--ui-shadow-pop);
      }
      .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 2px;
      }
      .opt {
        display: flex;
        align-items: center;
        gap: var(--ui-2);
        min-height: 2.75rem;
        padding: 0 var(--ui-2);
        border: 0;
        border-radius: calc(var(--ui-radius) * 0.75);
        background: transparent;
        color: inherit;
        font: inherit;
        font-size: var(--ui-fs-sm);
        text-align: start;
        cursor: pointer;
      }
      .opt:hover {
        background: var(--ui-hover);
      }
      .opt[aria-checked="true"] {
        background: var(--ui-selected);
        font-weight: 600;
      }
      .opt .name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .sw {
        position: relative;
        flex: none;
        display: inline-grid;
        place-items: center;
        width: 1.75rem;
        height: 1.75rem;
        border-radius: 0.4rem;
        background: var(--b);
        color: var(--i);
        border: 1px solid var(--ui-line-strong);
        font-family: var(--sc-font-family-headings, inherit);
        font-size: 0.6875rem;
        font-weight: 700;
        line-height: 1;
      }
      .sw::after {
        content: "";
        position: absolute;
        inset-block-end: 2px;
        inset-inline-end: 2px;
        width: 0.4rem;
        height: 0.4rem;
        border-radius: 50%;
        background: var(--p);
      }
      .dot {
        flex: none;
        width: 0.875rem;
        height: 0.875rem;
        border-radius: 50%;
        background: var(--b);
        box-shadow: inset 0 0 0 3px var(--p), 0 0 0 1px var(--ui-line-strong);
      }
    `,
  ];

  @state() private themeId = loadStoredThemeId();

  private pick(id: string) {
    this.themeId = id;
    chooseTheme(id);
  }

  private current(): ThemeOption {
    return THEMES.find((t) => t.id === this.themeId) ?? THEMES[0];
  }

  private option(t: ThemeOption) {
    return html`
      <button
        type="button"
        role="radio"
        class="opt"
        aria-checked=${t.id === this.themeId ? "true" : "false"}
        @click=${() => this.pick(t.id)}
      >
        <span class="sw" style=${`--b:${t.base};--i:${t.ink};--p:${t.accent}`} aria-hidden="true">Aa</span>
        <span class="name">${t.label}</span>
        ${t.id === this.themeId
          ? html`<sonic-icon library="custom" name="check" size="xs"></sonic-icon>`
          : null}
      </button>
    `;
  }

  render() {
    const cur = this.current();
    return html`
      <sonic-pop placement="bottom-end" shadow="sm">
        <sonic-button variant="ghost" size="sm" title="Apparence" aria-label=${`Apparence : ${cur.label}`}>
          <span
            slot="prefix"
            class="dot"
            style=${`--b:${cur.base};--p:${cur.accent}`}
            aria-hidden="true"
          ></span>
          <span class="label">${cur.label}</span>
        </sonic-button>
        <div slot="content" class="panel">
          <div role="radiogroup" aria-label="Thème">
            <div class="grid">${THEMES.map((t) => this.option(t))}</div>
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
