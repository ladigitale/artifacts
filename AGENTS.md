# Artefacts — agents

SPA Lit + Concorde (modèle Ceintures / belts).

- DataProvider `get` / `set` — pas de `sonic-fetch` / `PublisherManager`
- `@handle` + `DataProviderKey` — pas `@onAssign`
- Imports courts `@supersoniks/concorde/...`
- Port 3300 · appId `artifacts`
- API : Tadaaa `/api/artifacts` + `/api/public/artifacts/{slug}`
- Concorde **classique** (5.x). Tout le créatif/interactif (3d, shader, webgpu, hugging-face-infer, interactive, audio, media…) vient de `@supersoniks/creative-stack`, y compris les compléments de `sonic-if` / `sonic-value` et les fonctions JSONata (`$cosine`, `$rankBySimilarity`, `$mediaUrl` via l'alias `jsonata` de `vite.config.mts`). Pas de branche visual-stack.
- Smoke tests : `CHROME_PATH=…/chrome node scripts/smoke-<nom>.mjs` après `VITE_API_BASE_URL=http://localhost:4455 yarn build`.
