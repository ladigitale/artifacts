import {html, type TemplateResult} from "lit";
import "../components/artifact-shell";

/** Coque des pages connectées (bibliothèque, atelier, compte). Voir `artifact-shell`. */
export function renderAdminShell(children: TemplateResult | unknown): TemplateResult {
  return html`<artifact-shell>${children}</artifact-shell>`;
}
