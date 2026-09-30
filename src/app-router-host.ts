import {html, LitElement} from "lit";
import {customElement} from "lit/decorators.js";
import "@supersoniks/concorde/sonic-scope";
import {initAppearance, watchAppearanceSync} from "./app/appearance";
import {ICONOIR_CDN} from "./app/icons";
import {initArtifactsStore} from "./app/init";
import {router} from "./app/routes/router";

@customElement("app-router-host")
export class AppRouterHost extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.setAttribute("customIconLibraryPath", ICONOIR_CDN);
    this.setAttribute("customIconDefaultPrefix", "regular");
    initArtifactsStore();
    void initAppearance();
    watchAppearanceSync();
  }

  render() {
    return html`
      <sonic-scope
        customIconLibraryPath=${ICONOIR_CDN}
        customIconDefaultPrefix="regular"
      >
        ${router("")}
      </sonic-scope>
    `;
  }
}
