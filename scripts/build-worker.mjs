import { build } from "esbuild";
await build({
  entryPoints: ["src/tracking/worker.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  outfile: "public/tracking-worker.js",
  minify: true,
  legalComments: "eof",
});
