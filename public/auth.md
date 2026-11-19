# Authentication for agents

> How an AI agent authenticates to publish, list and read artefacts through the Tadaaa MCP server (OAuth 2.1 + PKCE).

Artefacts has no API of its own: the viewer at `https://artifacts.tadaaa.space` reads from the **Tadaaa API**, and agents publish and manage artefacts through the **Tadaaa MCP server**. Authentication is therefore Tadaaa's.

## What needs authentication

| Action | Auth | Endpoint |
|---|---|---|
| Read a `public` artefact | none | `GET https://api.tadaaa.space/api/public/artifacts/{slug}` |
| Read a `link` artefact | share token `?k=…` (no account) | same, with `?k={token}` |
| Read a `private` artefact, list, publish, update, delete, read/write data | OAuth bearer token, scope `mcp` | `https://api.tadaaa.space/mcp` |

## OAuth 2.1 (recommended for agents and MCP clients)

- Protected resource metadata (RFC 9728): `https://api.tadaaa.space/.well-known/oauth-protected-resource` (resource `https://api.tadaaa.space/mcp`).
- Authorization server metadata (RFC 8414): `https://api.tadaaa.space/.well-known/oauth-authorization-server` (issuer `https://api.tadaaa.space`).
- Authorization endpoint: `https://api.tadaaa.space/oauth/authorize`
- Token endpoint: `https://api.tadaaa.space/oauth/token`
- Dynamic client registration (RFC 7591): `https://api.tadaaa.space/oauth/register`
- Revocation: `https://api.tadaaa.space/oauth/revoke`
- Grant: `authorization_code` with PKCE `S256`, plus `refresh_token`.
- Client authentication: `none` (public client) or `client_secret_post`.
- Scopes:
  - `mcp` — call the MCP server tools on behalf of the user (rights follow the user's Tadaaa datasets: reader or writer).
  - `offline_access` — receive a refresh token.

Flow: an unauthenticated call to `https://api.tadaaa.space/mcp` answers `401` with a `WWW-Authenticate: Bearer` header pointing to the protected resource metadata. Register a client, run the authorization code + PKCE flow in the user's browser, then send `Authorization: Bearer <access_token>` on every MCP request. Most MCP clients (Claude, Cursor) do this automatically when you add the server URL.

## Personal access tokens

A Tadaaa user can also create a personal access token (prefix `tada_`) in their Tadaaa account and give it to a coding agent. Send it as `Authorization: Bearer tada_…` to `https://api.tadaaa.space/mcp`. Treat it like a password; revoke it from the account when no longer needed.

## Accounts

Accounts are self-serve at [app.tadaaa.space](https://app.tadaaa.space) (email confirmation). There is no sandbox: use a dedicated dataset for tests.

## Related

- [llms.txt](https://artifacts.tadaaa.space/llms.txt)
- [Agent instructions](https://artifacts.tadaaa.space/agents.md)
- [MCP server card](https://artifacts.tadaaa.space/.well-known/mcp/server-card.json)
