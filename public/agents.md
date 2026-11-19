# Artefacts — instructions for AI agents

Artefacts publishes **shareable full-page documents** (dashboards, reports, forms, small apps) described as declarative SDUI JSON and rendered with Concorde web components at `https://artifacts.tadaaa.space/<slug>`. Documents never contain executable code: components come from an allow-list served by `get_artifact_catalog`.

## When to use Artefacts

- The user wants a **shareable web page** of a result (summary, table, chart, checklist, form) with a stable public URL, without hosting anything.
- The user wants a page that **collects or shows data** over time (artefact collections, per-user or shared, via `write_artifact_data` / `read_artifact_data`).
- The user already works with **Tadaaa** datasets: artefacts belong to a dataset and inherit its members' rights.

Do **not** use it for: arbitrary HTML/JS hosting, secrets or personal data meant to stay private behind a public link, large file storage.

## How

1. Connect the MCP server `https://api.tadaaa.space/mcp` (OAuth, see [auth.md](https://artifacts.tadaaa.space/auth.md)).
2. `get_artifact_catalog` → allowed components and document shape.
3. `validate_artifact` on your draft, fix errors, then `publish_artifact` (choose `visibility`: `private`, `link` or `public`).
4. Give the user the returned URL (`https://artifacts.tadaaa.space/<slug>`, plus `?k=…` for `link`).
5. Later: `update_artifact` (new version), `get_artifact`, `list_artifacts`, `delete_artifact` (ask the user first).

## Reading an artefact someone shared

`GET https://api.tadaaa.space/api/public/artifacts/{slug}` (add `?k=` from the share link if present) returns the JSON document — easier than rendering the SPA. In a browser with WebMCP, the viewer page also exposes read-only tools: `get_displayed_artifact`, `get_public_artifact`, `read_public_collection`.

## Rules

- Never publish `public` without the user's consent; default to `private` or `link`.
- Do not put credentials, tokens or personal data in an artefact document.
- `delete_artifact` is irreversible for the public URL: confirm with the user.

More: [llms.txt](https://artifacts.tadaaa.space/llms.txt) · Source: [github.com/ladigitale/artifacts](https://github.com/ladigitale/artifacts)
