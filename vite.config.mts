import {defineConfig} from "vite";
import concordeConf from "@supersoniks/concorde/vite-config";
import tsConfig from "./tsconfig.json";
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
  return (chunk: {facadeModuleId?: string | null}) => {
    const addon = /creative-stack\/src\/addons\/([\w-]+)\/index\.ts$/.exec(chunk.facadeModuleId ?? "")?.[1];
    return `${prefix}${addon ? `addon-${addon}` : "[name]"}-[hash].js`;
  };
}

/**
 * Le plugin de préfixe de Concorde ne connaît que les composants déclarés par
 * `const tagName = "sonic-…"` ; quelques-uns sont déclarés en littéral
 * (`@customElement("sonic-jsonata")`, `sonic-mix`) et resteraient en conflit avec un
 * Concorde hôte. On les préfixe aussi (embed uniquement).
 */
function prefixLiteralConcordeTags(prefix: string) {
  const src = path.resolve(__dirname, "node_modules/@supersoniks/concorde/src");
  const known = new Set<string>();
  const literal = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "docs") walk(file);
      } else if (/\.ts$/.test(entry.name) && !/\.spec\.ts$/.test(entry.name)) {
        const code = fs.readFileSync(file, "utf8");
        for (const m of code.matchAll(/const tagName = "(sonic-[\w-]+)"/g)) known.add(m[1]);
        for (const m of code.matchAll(/customElement\(\s*"(sonic-[\w-]+)"/g)) literal.add(m[1]);
      }
    }
  };
  walk(src);
  const tags = [...literal].filter((t) => !known.has(t) && !t.endsWith("-demo"));
  const pattern = tags.length
    ? new RegExp(`\\b(${tags.map((t) => t.slice("sonic-".length)).join("|")})(?![\\w-])`, "g")
    : null;
  const sonic = "sonic-";
  return {
    name: "artifacts-embed-literal-tags",
    transform(code: string, id: string) {
      if (!pattern) return null;
      if (id.includes("node_modules") && !id.includes("@supersoniks")) return null;
      if (!/\.(ts|js|json|css)(\?|$)/.test(id)) return null;
      if (!code.includes(sonic)) return null;
      const next = code.replace(new RegExp(sonic + pattern.source, "g"), `${prefix}-$1`);
      return next === code ? null : {code: next, map: null};
    },
  };
}
const embedBuild = {
  outDir: "dist/embed",
  emptyOutDir: true,
  copyPublicDir: false,
  modulePreload: false,
  rollupOptions: {
    input: {"artifact-embed": path.resolve(__dirname, "src/embed/artifact-embed.ts")},
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
        rollupOptions: {output: {chunkFileNames: chunkFileNames("assets/")}},
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
    ...(isEmbed ? [prefixLiteralConcordeTags("afx")] : []),
    postcssLit({
      include: ["/src/**/*.css", "/src/**/*.css?*"],
    }),
  ],
  resolve: {
    alias: [
      {find: "@tailwind", replacement: path.resolve(__dirname, "./src/css/tailwind.ts")},
      /* $cosine, $rankBySimilarity, $mediaUrl dans sonic-jsonata (ajouts visual-stack portés
       * dans la creative-stack) : Concorde classique n'a pas de point d'extension JSONata. */
      {find: /^jsonata$/, replacement: "@supersoniks/creative-stack/jsonata"},
      /* Embed : le plugin de préfixe réécrit aussi les chemins d'import
       * (`@supersoniks/concorde/sonic-scope` → `…/afx-scope`) ; on les ramène au fichier réel. */
      ...(isEmbed
        ? [{find: /^@supersoniks\/concorde\/(.*)afx-/, replacement: "@supersoniks/concorde/$1sonic-"}]
        : []),
      /* Embed : le plugin de préfixe réécrit aussi les chemins d'import
       * (`@supersoniks/concorde/sonic-scope` → `…/afx-scope`) ; on les ramène au fichier réel. */
      ...(isEmbed
        ? [{find: /^@supersoniks\/concorde\/(.*)afx-/, replacement: "@supersoniks/concorde/$1sonic-"}]
        : []),
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
