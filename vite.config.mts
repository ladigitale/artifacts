import {defineConfig} from "vite";
import concordeConf from "@supersoniks/concorde/vite-config";
import tsConfig from "./tsconfig.json" with {type: "json"};
import fs from "fs";
import path from "path";
import postcssLit from "rollup-plugin-postcss-lit";

//write a vite pluggin function  that remoces the @customElement décorator from the code comming from concorde components

export const packages = {
  concorde: {
    outDir: "dist",
  },
};

let libName = process.env.LIB_NAME;
if (!libName) libName = "concorde";
const currentConfig = packages[libName];

/**
 * `LIB_NAME=embed` : web component <artifact-embed> pour l'intégration par balise script
 * (public/embed.js → dist/embed/artifact-embed.js). Lancé après le build du viewer.
 * - préfixe `afx` : les composants Concorde deviennent afx-* (pas de conflit avec un
 *   Concorde déjà présent sur la page hôte) ;
 * - URLs des chunks, workers et worklets relatives à import.meta.url : le bundle tourne
 *   depuis n'importe quelle origine (il faut le CORS sur /embed/*, cf. artifacts.caddy).
 */
const isEmbed = libName === "embed";

/** Chunks des addons à la demande nommés d'après l'addon (`addon-audio-…js`). */
function chunkFileNames(prefix: string) {
  const addonIndex = /creative-stack\/src\/addons\/([\w-]+)\/index\.ts$/;
  return (chunk: {facadeModuleId?: string | null; moduleIds?: string[]}) => {
    // Rolldown ne donne pas toujours l'index de l'addon comme façade (index qui ne fait que
    // réexporter) : on le cherche alors parmi les modules du chunk, s'il n'y en a qu'un.
    const inChunk = (chunk.moduleIds ?? []).map((id) => addonIndex.exec(id)?.[1]).filter(Boolean);
    const addon = addonIndex.exec(chunk.facadeModuleId ?? "")?.[1] ?? (inChunk.length === 1 ? inChunk[0] : undefined);
    return `${prefix}${addon ? `addon-${addon}` : "[name]"}-[hash].js`;
  };
}

/**
 * Le plugin de préfixe de Concorde ne connaît que les composants Concorde déclarés par
 * `const tagName = "sonic-…"`. En embed, on préfixe aussi (sinon conflit avec une page hôte
 * qui charge son propre Concorde ou sa propre creative-stack) :
 * - les composants Concorde déclarés en littéral (`@customElement("sonic-jsonata")`, `sonic-mix`) ;
 * - tous les composants déclarés de la creative-stack (`sonic-store`, `sonic-3d`, `sonic-patch`…),
 *   manifestes des addons compris (`remapDocumentTags` s'y fie pour les addons pas encore chargés).
 * Les modules enfants définis en boucle (`sonic-osc`, `sonic-voice`, `sonic-body`…) gardent leur
 * nom : la bibliothèque de patches les construit dynamiquement (`sonic-${tag}`).
 */
function embedTagsToPrefix(): string[] {
  const scan = (root: string, re: RegExp, out: Set<string>) => {
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "docs" && entry.name !== "node_modules") walk(file);
        } else if (/\.ts$/.test(entry.name) && !/\.spec\.ts$/.test(entry.name)) {
          for (const m of fs.readFileSync(file, "utf8").matchAll(re)) out.add(m[1]);
        }
      }
    };
    if (fs.existsSync(root)) walk(root);
    return out;
  };
  const concorde = path.resolve(import.meta.dirname, "node_modules/@supersoniks/concorde/src");
  const known = scan(concorde, /const tagName = "(sonic-[\w-]+)"/g, new Set());
  const literal = scan(concorde, /customElement\(\s*"(sonic-[\w-]+)"/g, new Set());
  const creative = scan(
    path.resolve(import.meta.dirname, "node_modules/@supersoniks/creative-stack/src"),
    /(?:const tagName = |customElement\(\s*|customElements\.define\(\s*)"(sonic-[\w-]+)"/g,
    new Set(),
  );
  const tags = new Set([...literal, ...creative]);
  return [...tags].filter((t) => !known.has(t) && !t.endsWith("-demo"));
}

function prefixEmbedTags(prefix: string) {
  const tags = embedTagsToPrefix().sort((a, b) => b.length - a.length);
  const sonic = "sonic-";
  const pattern = tags.length
    ? new RegExp(`(?<![\\w-])${sonic}(${tags.map((t) => t.slice(sonic.length)).join("|")})(?![\\w-])`, "g")
    : null;
  return {
    name: "artifacts-embed-tags",
    transform(code: string, id: string) {
      if (!pattern) return null;
      if (id.includes("node_modules") && !id.includes("@supersoniks")) return null;
      if (!/\.(ts|js|json|css)(\?|$)/.test(id)) return null;
      if (!code.includes(sonic)) return null;
      const next = code.replace(pattern, `${prefix}-$1`);
      return next === code ? null : {code: next, map: null};
    },
  };
}
/**
 * Embed : le plugin de préfixe réécrit aussi les chemins d'import
 * (`@supersoniks/concorde/sonic-scope` → `…/afx-scope`) ; on les ramène au fichier réel.
 * En `enforce: "pre"` : sous Vite 8 le résolveur de Concorde passe avant `resolve.alias`
 * et renverrait un chemin `afx-…` qui n'existe pas.
 */
function restoreEmbedImportPaths(prefix: string) {
  const rewritten = new RegExp(`^(@supersoniks/concorde/.*)${prefix}-`);
  return {
    name: "artifacts-embed-import-paths",
    enforce: "pre" as const,
    resolveId(this: {resolve: (id: string, importer?: string, options?: object) => unknown}, source: string, importer?: string) {
      if (!rewritten.test(source)) return null;
      return this.resolve(source.replace(rewritten, "$1sonic-"), importer, {skipSelf: true});
    },
  };
}

const embedBuild = {
  outDir: "dist/embed",
  emptyOutDir: true,
  copyPublicDir: false,
  modulePreload: false,
  rolldownOptions: {
    input: {"artifact-embed": path.resolve(import.meta.dirname, "src/embed/artifact-embed.ts")},
    preserveEntrySignatures: "allow-extension" as const,
    output: {
      entryFileNames: "[name].js",
      chunkFileNames: chunkFileNames("chunks/"),
      assetFileNames: "assets/[name]-[hash][extname]",
    },
  },
};

const config = {
  build: isEmbed
    ? embedBuild
    : {
        outDir: currentConfig.outDir,
        emptyOutDir: true,
        lib: currentConfig.lib,
        rolldownOptions: {output: {chunkFileNames: chunkFileNames("assets/")}},
      },
  ...(isEmbed
    ? {
        experimental: {
          renderBuiltUrl: () => ({relative: true}),
        },
      }
    : {}),
  server: {
    watch: {
      ignored: ["**/*.svg"],
    },
  },
  plugins: [
    ...(isEmbed ? [restoreEmbedImportPaths("afx"), prefixEmbedTags("afx")] : []),
    postcssLit({
      include: ["/src/**/*.css", "/src/**/*.css?*"],
    }),
  ],
  resolve: {
    alias: [
      {find: "@tailwind", replacement: path.resolve(import.meta.dirname, "./src/css/tailwind.ts")},
      /* $cosine, $rankBySimilarity, $mediaUrl dans sonic-jsonata (ajouts visual-stack portés
       * dans la creative-stack) : Concorde classique n'a pas de point d'extension JSONata. */
      {find: /^jsonata$/, replacement: "@supersoniks/creative-stack/jsonata"},
    ],
  },
};

export default defineConfig(
  concordeConf({
    componentPrefix: isEmbed ? "afx" : "sonic",
    tsConfig: tsConfig,
    viteConfig: config,
  })
);
