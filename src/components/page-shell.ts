import {css, html, LitElement} from "lit";
import {customElement} from "lit/decorators.js";
import tailwind from "@tailwind";

/** Rhythm vertical commun (aligné Tadaaa `page-shell`). */
@customElement("page-shell")
export class PageShell extends LitElement {
  static styles = [
    tailwind,
    css`
      :host {
        display: block;
      }
    `,
  ];

  render() {
    return html`
      <div class="flex flex-col gap-3 sm:gap-4 md:gap-5">
        <slot></slot>
      </div>
    `;
  }
}
