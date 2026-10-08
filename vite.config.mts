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
      chunkFileNames: "chunks/[name]-[hash].js",
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
