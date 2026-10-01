import {html} from "lit";
import "../../../../components/artifact-edit-page";

export default function EditPage(params?: Record<string, string>) {
  return html`<artifact-edit-page slug=${params?.slug ?? ""}></artifact-edit-page>`;
}
