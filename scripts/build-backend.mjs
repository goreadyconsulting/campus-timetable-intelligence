import { build } from "esbuild";
await build({
  entryPoints: ["lib/domain.ts"],
  bundle: true,
  format: "iife",
  globalName: "CTIDomain",
  platform: "neutral",
  target: "es2020",
  outfile: "apps-script/Domain.gs",
  minify: false,
  legalComments: "none",
});
