import {html} from "lit";
import "../../components/artifact-viewer";

export default function ArtifactPage(params?: Record<string, string>) {
  const slug = params?.slug ?? "";
  return html`<artifact-viewer slug=${slug}></artifact-viewer>`;
}
