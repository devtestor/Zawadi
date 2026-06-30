// Inject Alcurry page identity + link-preview tags into the exported web
// index.html. Expo's +html.tsx is only used by *static* web output; this app
// ships single-page output, where the <head> is a fixed template whose <title>
// comes from app.json's `name`. So we post-process the export instead.
//
// Run from the mobile/ dir after `expo export`:  bun scripts/inject-meta.mjs [outDir]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2] || "dist";
const file = join(outDir, "index.html");

const DESC =
  "Buy and sell Property, Land, Cars, Mining Sites, and Machinery across 54 African countries.";
const TITLE = "Alcurry — Africa's Marketplace";
const IMG = "https://alcurry.app/og-image.png";

const head = `<title>${TITLE}</title>
    <meta name="description" content="${DESC}" />
    <meta name="theme-color" content="#D4A843" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Alcurry" />
    <meta property="og:title" content="${TITLE}" />
    <meta property="og:description" content="${DESC}" />
    <meta property="og:url" content="https://alcurry.app" />
    <meta property="og:image" content="${IMG}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${TITLE}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${TITLE}" />
    <meta name="twitter:description" content="${DESC}" />
    <meta name="twitter:image" content="${IMG}" />`;

let html = readFileSync(file, "utf8");
if (!/<title>[^<]*<\/title>/.test(html)) {
  console.error(`inject-meta: no <title> found in ${file} — aborting`);
  process.exit(1);
}
html = html.replace(/<title>[^<]*<\/title>/, head);
writeFileSync(file, html);
console.log(`inject-meta: wrote Alcurry head metadata into ${file}`);
