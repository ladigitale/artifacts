import {html} from "lit";
import "../../../../components/artifact-versions-page";

export default function VersionsPage(params?: Record<string, string>) {
  return html`<artifact-versions-page slug=${params?.slug ?? ""}></artifact-versions-page>`;
}
