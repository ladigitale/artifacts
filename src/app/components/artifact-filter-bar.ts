import "@supersoniks/concorde/button";
import "@supersoniks/concorde/icon";
import "@supersoniks/concorde/input";
import "@supersoniks/concorde/pop";
import {html, LitElement, css} from "lit";
import {customElement, property} from "lit/decorators.js";
import {hidePop, uiStyles} from "../styles/ui";

export type FilterOption = {
  value: string;
  label: string;
};

export type FilterSelectConfig = {
  name: string;
  label: string;
  triggerLabel: string;
  icon?: string;
  options: readonly FilterOption[];
  value?: string;
  defaultValue?: string;
};

@customElement("artifact-filter-bar")
export class ArtifactFilterBar extends LitElement {
  static styles = [
    uiStyles,
    css`
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--ui-2);
      }
      .toolbar sonic-input {
        flex: 1 1 14rem;
        min-width: 10rem;
        /* Loupe discrète sur fond de surface, au lieu du bloc plein de Concorde. */
        --sc-input-addon-bg: transparent;
        --sc-input-addon-color: var(--ui-muted);
        --sc-input-bg: var(--sc-base);
      }
      .panel {
        min-width: 12rem;
        padding: var(--ui-2);
        background: var(--sc-base);
        color: var(--sc-base-content);
        border: 1px solid var(--ui-line);
        border-radius: var(--ui-radius);
        box-shadow: var(--ui-shadow-pop);
      }
      .panel .label {
        display: block;
        padding: var(--ui-1) var(--ui-2) var(--ui-2);
        color: var(--ui-muted);
        font-size: var(--ui-fs-xs);
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .panel-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .opt {
        display: flex;
        align-items: center;
        gap: var(--ui-2);
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
        cursor: pointer;
      }
      .opt .name {
        flex: 1;
      }
      .opt:hover {
        background: var(--ui-hover);
      }
      .opt[aria-checked="true"] {
        background: var(--ui-selected);
        font-weight: 600;
      }
    `,
  ];

  @property({type: String}) searchName = "q";
  @property({type: String}) searchPlaceholder = "Rechercher…";
  @property({attribute: false}) selects: FilterSelectConfig[] = [];

  private choose(e: Event, name: string, value: string) {
    hidePop(e);
    this.dispatchEvent(
      new CustomEvent("select-change", {detail: {name, value}, bubbles: true, composed: true}),
    );
  }

  private renderOption(select: FilterSelectConfig, option: FilterOption) {
    const on = (select.value ?? select.defaultValue) === option.value;
    return html`
      <button
        type="button"
        role="menuitemradio"
        class="opt"
        aria-checked=${on ? "true" : "false"}
        @click=${(e: Event) => this.choose(e, select.name, option.value)}
      >
        <span class="name">${option.label}</span>
        ${on ? html`<sonic-icon library="custom" name="check" size="xs"></sonic-icon>` : null}
      </button>
    `;
  }

  private renderSelect(select: FilterSelectConfig) {
    const active =
      select.defaultValue !== undefined &&
      select.value !== undefined &&
      select.value !== select.defaultValue;

    return html`
      <sonic-pop placement="bottom-start" shadow="sm">
        <sonic-button variant="outline" size="sm" ?active=${active}>
          <sonic-icon
            slot="prefix"
            library="custom"
            name=${select.icon ?? "filter"}
            size="sm"
          ></sonic-icon>
          ${select.triggerLabel}
          <sonic-icon
            slot="suffix"
            library="custom"
            name="nav-arrow-down"
            size="sm"
          ></sonic-icon>
        </sonic-button>
        <div slot="content" class="panel">
          <span class="label">${select.label}</span>
          <div class="panel-list" role="menu" aria-label=${select.label}>
            ${select.options.map((option) => this.renderOption(select, option))}
          </div>
        </div>
      </sonic-pop>
    `;
  }

  protected render() {
    return html`
      <div class="toolbar">
        <sonic-input
          name=${this.searchName}
          type="search"
          size="sm"
          placeholder=${this.searchPlaceholder}
        >
          <sonic-icon
            slot="prefix"
            library="custom"
            name="search"
            size="sm"
          ></sonic-icon>
        </sonic-input>
        ${this.selects.map((select) => this.renderSelect(select))}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "artifact-filter-bar": ArtifactFilterBar;
  }
}
