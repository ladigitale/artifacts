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

const config = {
  build: {
    outDir: currentConfig.outDir,
    emptyOutDir: true,
    lib: currentConfig.lib,
  },
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
    ],
  },
};

export default defineConfig(
  concordeConf({
    componentPrefix: "sonic",
    tsConfig: tsConfig,
    viteConfig: config,
  })
);
