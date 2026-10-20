import { build } from "esbuild";
await build({
  entryPoints: ["supabase/functions/cti-api/index.ts"],
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  outfile: "supabase/functions/cti-api/bundle.js",
  minify: false,
  legalComments: "none",
});
