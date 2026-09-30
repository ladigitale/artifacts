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
    emptyOutDir: false,
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
    alias: {
      "@tailwind": path.resolve(__dirname, "./src/css/tailwind.ts"),
    },
  },
};

export default defineConfig(
  concordeConf({
    componentPrefix: "sonic",
    tsConfig: tsConfig,
    viteConfig: config,
  })
);
