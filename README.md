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


## Intégration sur un autre site

```html
<script src="https://artifacts.tadaaa.space/embed.js" data-artifact="mon-slug" async></script>
```

Options : `data-theme` (dark, nord…), `data-view` (vue de départ), `data-key` (artefact « link »),
`data-read-key`, `data-height` (`480px`), `data-target` (sélecteur du conteneur),
`data-transparent`, `data-open-link="false"`. En module : `<artifact-embed slug="…">` après
`<script type="module" src="https://artifacts.tadaaa.space/embed/artifact-embed.js">`.
La balise est proposée dans l’édition d’un artefact (`/admin/{slug}/edit`).

- `public/embed.js` : petit chargeur ; le module commun n’est chargé qu’une fois par page,
  quel que soit le nombre d’artefacts.
- `src/embed/` → `dist/embed/` (`yarn build:embed`, inclus dans `yarn build`) : composants
  Concorde préfixés `afx-` (aucun conflit avec un Concorde de la page hôte), shadow DOM,
  vues internes (le hash de l’hôte n’est jamais touché), lecture publique sans compte.
- Addons creative-stack (3d, shader, audio, physique…) chargés à la demande d’après les
  composants du document, une seule fois par page (`src/app/addons.ts`, aussi pour le viewer).
- Deux artefacts d’une page qui déclarent les mêmes DataProviders / stores (ou deux fois le
  même) : le second est préfixé automatiquement (`src/app/dp-namespace.ts`).
- Côté Tadaaa : CORS anonyme sur `/api/public/artifacts/*` (PublicArtifactCorsSubscriber) et
  sur `/embed.js`, `/embed/*`, `/assets/*` (artifacts.caddy).
- Limites : la CSP de la page hôte s’applique (scripts depuis l’origine Artefacts,
  jsDelivr pour les libs, fonts.googleapis.com) ; caméra / micro / MIDI dépendent de la
  Permissions-Policy de l’hôte ; un composant creative-stack déjà défini par l’hôte
  (`sonic-store`…) est conservé tel quel (avertissement console).
- Smoke test : `CHROME_PATH=…/chrome yarn smoke:embed`.
