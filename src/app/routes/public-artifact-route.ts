import {html, type TemplateResult} from "lit";
import "../components/artifact-viewer";

const RESERVED = new Set(["admin", "cloud"]);

/**
 * Catch-all public artefact. Must be router `fallback` — Concorde renders
 * *every* matching route, so `/:slug` would also paint `/admin` and `/cloud`.
 */
export function renderPublicArtifactRoute(): TemplateResult {
  const pathname = (location.pathname.replace(/\/+$/, "") || "/") as string;
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 1) return html``;
  const slug = parts[0];
  if (!slug || RESERVED.has(slug)) return html``;
  return html`<artifact-viewer slug=${slug}></artifact-viewer>`;
}
