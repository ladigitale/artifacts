/**
 * generate-routes puts `/:slug` before reserved paths.
 * Rewrite layoutRoutes so `/`, `/admin`, `/cloud` win over `/:slug`.
 */
import {readFileSync, writeFileSync} from "fs";
import {join, dirname} from "path";
import {fileURLToPath} from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const routerPath = join(root, "src/app/routes/router.ts");
let src = readFileSync(routerPath, "utf8");

const block = `const layoutRoutes = {
    "/$": page,
    "/admin\\\\b": (params?: Record<string, string>) => adminLayout(html\`<sonic-router .basePath=\${basePath} .routes=\${adminLayoutRoutes}></sonic-router>\`, params),
    "/cloud\\\\b": (params?: Record<string, string>) => cloudLayout(html\`<sonic-router .basePath=\${basePath} .routes=\${cloudLayoutRoutes}></sonic-router>\`, params),
    "/:slug(/*)": () => html\`<sonic-router .basePath=\${basePath} .routes=\${_slugDefaultLayoutRoutes}></sonic-router>\`,
}        
return layout`;

const re = /const layoutRoutes = \{[\s\S]*?\}\s*;?\s*\nreturn layout/;
if (!re.test(src)) {
  console.error("fix-router-order: layoutRoutes block not found");
  process.exit(1);
}
src = src.replace(re, block);
writeFileSync(routerPath, src);
console.log("fix-router-order: reserved routes first");
