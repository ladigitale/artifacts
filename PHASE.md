# Artefacts — avancement

## Fait

### API Tadaaa
- Entités, migration `Version20260929210000`, CRUD + public + records
- Validator + catalogue Concorde 4.9.3
- MCP : get/validate/publish/update/get/list/delete + read/write data
- `ArtifactDataService` (scope per_user / writeMode)
- `app:artifacts:seed-demo`

### Viewer (`/usr2/sites/atelier/artifacts`)
- Build OK (`yarn build`)
- Routes `/`, `/{slug}/`, `/{slug}/versions`, `/cloud`
- SSO handoff, collections publiques, transforms `$count(...)` safe (pas d’eval)
- Port 3300

### Déploiement
- `deploy/cohost/artifacts.caddy` (CSP stricte, pas d’unsafe-eval)
- `compose.prod.artifacts-cohost.yaml`
- Scripts root `artifacts:dev|build|preview`, sibling clone

## Chez toi
```bash
cd /usr2/sites/poc/tada
yarn api:up && yarn api:migrate
./scripts/clone-sibling-apps.sh   # ou symlink déjà fait
yarn artifacts:dev
```
