# Artefacts

> Public viewer for Concorde SDUI documents published through the Tadaaa API and MCP server. One artefact = one URL, artifacts.tadaaa.space/<slug>.

Artefacts is the public viewer for documents published with **Tadaaa**: declarative SDUI JSON (Concorde web components, allow-listed, never executable code) rendered as a full page at `https://artifacts.tadaaa.space/<slug>`.

- **Publish from an agent** — Claude, Cursor or any MCP client calls the Tadaaa MCP server (`https://api.tadaaa.space/mcp`): `validate_artifact`, `publish_artifact`, `update_artifact`.
- **Share** — `public`, `link` (secret `?k=` token) or `private` (members of the Tadaaa dataset).
- **Versioned** — each update is a new version; collections store data written from the page.
- **Read as JSON** — `GET https://api.tadaaa.space/api/public/artifacts/{slug}`.

Signed-in users manage their artefacts in the library (`/admin`) after logging in with their Tadaaa account.

## For agents

- [llms.txt](https://artifacts.tadaaa.space/llms.txt) — overview and endpoints
- [agents.md](https://artifacts.tadaaa.space/agents.md) — when and how to use Artefacts
- [auth.md](https://artifacts.tadaaa.space/auth.md) — OAuth 2.1 / MCP authentication
- [AI catalog](https://artifacts.tadaaa.space/.well-known/ai-catalog.json) · [MCP server card](https://artifacts.tadaaa.space/.well-known/mcp/server-card.json)

## About

- [About](https://artifacts.tadaaa.space/about.html) · [Contact](https://artifacts.tadaaa.space/contact.html) · [Privacy](https://artifacts.tadaaa.space/privacy.html) · [Pricing](https://artifacts.tadaaa.space/pricing.md) (free)
- Source code, MIT: [github.com/ladigitale/artifacts](https://github.com/ladigitale/artifacts) · [github.com/ladigitale/tadaaa](https://github.com/ladigitale/tadaaa)
