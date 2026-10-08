# Artefacts — agents

SPA Lit + Concorde (modèle Ceintures / belts).

- DataProvider `get` / `set` — pas de `sonic-fetch` / `PublisherManager`
- `@handle` + `DataProviderKey` — pas `@onAssign`
- Imports courts `@supersoniks/concorde/...`
- Port 3300 · appId `artifacts`
- API : Tadaaa `/api/artifacts` + `/api/public/artifacts/{slug}`
- Concorde **classique** (5.x). Tout le créatif/interactif (3d, shader, webgpu, hugging-face-infer, interactive, audio, media…) vient de `@supersoniks/creative-stack`, y compris les compléments de `sonic-if` / `sonic-value` et les fonctions JSONata (`$cosine`, `$rankBySimilarity`, `$mediaUrl` via l'alias `jsonata` de `vite.config.mts`). Pas de branche visual-stack.
- Smoke tests : `CHROME_PATH=…/chrome node scripts/smoke-<nom>.mjs` après `VITE_API_BASE_URL=http://localhost:4455 yarn build`.
- Embed : `public/embed.js` + `src/embed/` (build `LIB_NAME=embed`, préfixe `afx`). Ne jamais lire `location` / `history` en mode `embedded` du viewer. Addons creative-stack : à la demande via `src/app/addons.ts` (pas d'import statique hors `interactive`).
- Vues A2UI : `views[].a2ui` (messages A2UI v0.9, exclusif avec `root`) rendus par `@ladigitale/agent-stack` (`src/app/components/artifact-a2ui-view.ts`) ; `views[].actionStore` reçoit les actions (`{type: name, payload: {...context, surfaceId, sourceComponentId}}`). Libraries `a2ui:*` / `chat:*` d'agent-stack ajoutées à toutes les vues SDUI (`withAgentLibraries`). Smoke : `node scripts/smoke-a2ui.mjs`.
- Atelier : `/admin/atelier` et `/admin/{slug}/atelier` (`src/app/components/artifact-atelier-page.ts`) — `sonic-chat` (agent-stack) sur `POST {api}/agent/artifacts/run` (Tadaaa, profil `artifacts`), aperçu par `artifact-viewer` en mode `previewDocument` (aucun appel API, pas de sinks) alimenté par l'événement `artifact-preview`. Smoke : `node scripts/smoke-atelier-chat.mjs`.
