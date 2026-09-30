# Artefacts

Viewer Concorde SDUI pour les artefacts publiés via l’API / MCP Tadaaa.

- Port dev : **3300**
- SSO Tadaaa (handoff), droits = datasets
- Un artefact = JSON SDUI (liste blanche), jamais de code

## Dev

```bash
yarn install
yarn dev
```

API Tadaaa locale : `ARTIFACTS_PUBLIC_URL=http://localhost:3300` + CORS.

Voir le monorepo Tadaaa (`apps/api`) pour les endpoints `/api/artifacts` et `/api/public/artifacts`.


## Sécurité / CSP

Prod Caddy (`deploy/cohost/artifacts.caddy` côté Tadaaa) : CSP stricte, **pas** de `unsafe-eval`.

Transforms `data.transforms[].jsonata` : Concorde 4.9.3 n’expose pas `sonic-jsonata`.
Le viewer applique un sous-ensemble sûr ou ignore les transforms non supportées (voir `src/app/jsonata-safe.ts`).
