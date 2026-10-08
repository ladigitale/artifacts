import {html} from "lit";
import "../../../../components/artifact-atelier-page";

export default function AtelierEditPage(params?: Record<string, string>) {
  return html`<artifact-atelier-page slug=${params?.slug ?? ""}></artifact-atelier-page>`;
}
