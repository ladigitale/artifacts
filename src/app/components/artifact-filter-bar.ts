import "@supersoniks/concorde/button";
import "@supersoniks/concorde/icon";
import "@supersoniks/concorde/input";
import "@supersoniks/concorde/pop";
import {html, LitElement, css} from "lit";
import {customElement, property} from "lit/decorators.js";
import tailwind from "../../css/tailwind";
import {formLabelStyles} from "../styles/form-label";

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
    tailwind,
    formLabelStyles,
    css`
      :host {
        display: block;
      }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        gap: 0.5rem 0.65rem;
      }
      .toolbar sonic-input {
        flex: 1 1 12rem;
        min-width: 10rem;
      }
      .panel {
        min-width: 11rem;
        padding: 0.75rem;
        background: var(--sc-base);
        color: var(--sc-base-content);
        border: 1px solid var(--sc-base-100);
        border-radius: var(--sc-rounded, 0.25rem);
      }
      .panel-list {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        margin-top: 0.45rem;
      }
      .panel-list sonic-button {
        width: 100%;
        justify-content: flex-start;
      }
    `,
  ];

  @property({type: String}) searchName = "q";
  @property({type: String}) searchPlaceholder = "Rechercher…";
  @property({attribute: false}) selects: FilterSelectConfig[] = [];

  private renderOption(name: string, option: FilterOption) {
    return html`
      <sonic-button
        unique
        name=${name}
        value=${option.value}
        variant="ghost"
        size="sm"
        justify="flex-start"
        align="left"
      >
        <sonic-icon
          slot="prefix"
          library="custom"
          name="check"
          size="xs"
          swap="on"
        ></sonic-icon>
        <sonic-icon
          slot="prefix"
          library="custom"
          name="circle"
          size="xs"
          swap="off"
        ></sonic-icon>
        ${option.label}
      </sonic-button>
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
          <span class="form-label">${select.label}</span>
          <div class="panel-list">
            ${select.options.map((option) => this.renderOption(select.name, option))}
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
