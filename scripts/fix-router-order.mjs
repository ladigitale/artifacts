/**
 * Post-process Concorde generate-routes:
 * 1. Reserved paths (`/`, `/admin`, `/cloud`) before catch-all
 * 2. Public artefacts via `fallback` — NOT `/:slug` — because Concorde paints
 *    every matching route (so `/:slug` would also mount on `/admin`).
 */
import {readFileSync, writeFileSync} from "fs";
import {join, dirname} from "path";
import {fileURLToPath} from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const routerPath = join(root, "src/app/routes/router.ts");
let src = readFileSync(routerPath, "utf8");

if (!src.includes("public-artifact-route")) {
  src = src.replace(
    `import page from "./page";`,
    `import page from "./page";\nimport {renderPublicArtifactRoute} from "./public-artifact-route";`,
  );
}

const block = `const layoutRoutes = {
    "/$": page,
    "/admin\\\\b": (params?: Record<string, string>) => adminLayout(html\`<sonic-router .basePath=\${basePath} .routes=\${adminLayoutRoutes}></sonic-router>\`, params),
    "/cloud\\\\b": (params?: Record<string, string>) => cloudLayout(html\`<sonic-router .basePath=\${basePath} .routes=\${cloudLayoutRoutes}></sonic-router>\`, params),
    fallback: () => renderPublicArtifactRoute(),
}        
return layout`;

const re = /const layoutRoutes = \{[\s\S]*?\}\s*;?\s*\nreturn layout/;
if (!re.test(src)) {
  console.error("fix-router-order: layoutRoutes block not found");
  process.exit(1);
}
src = src.replace(re, block);
writeFileSync(routerPath, src);
console.log("fix-router-order: reserved routes + artifact fallback");
