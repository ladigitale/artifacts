#!/usr/bin/env node
/**
 * Resolve Concorde generate-routes whether deps are hoisted or local.
 */
import {createRequire} from "module";
import {spawnSync} from "child_process";
import {dirname, join} from "path";

const require = createRequire(import.meta.url);
const viteConfig = require.resolve("@supersoniks/concorde/vite-config");
const script = join(dirname(viteConfig), "../scripts/generate-routes.js");
const result = spawnSync(process.execPath, [script, ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
