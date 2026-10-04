import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateSnapshot } from "./validate.mjs";

const marker = '<script id="board-data" type="application/json">[]</script>';
const codecImport = 'import { embedSnapshot, extractSnapshot } from "./png.mjs";';

export function packageBoards(inputs, outputDirectory) {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new Error("Provide at least one native Quickdraw JSON file.");
  const seen = new Set();
  const entries = [];
  const results = [];
  for (const input of inputs) {
    const filename = basename(input);
    if (extname(filename).toLowerCase() !== ".json") throw new Error("Input must have a .json extension: " + input);
    const identity = filename.toLowerCase();
    if (seen.has(identity) || identity === "validation-report.json") throw new Error("Conflicting delivery filename: " + filename);
    seen.add(identity);
    const snapshot = JSON.parse(readFileSync(input, "utf8"));
    const result = validateSnapshot(snapshot);
    entries.push({ name: basename(filename, extname(filename)), snapshot });
    results.push({ file: filename, ...result, quickdrawStoreRoundTrip: false });
  }
  const template = readFileSync(new URL("../assets/viewer-template.html", import.meta.url), "utf8");
  if (template.split(marker).length !== 2) throw new Error("Viewer template must contain exactly one empty board-data marker.");
  if (template.split(codecImport).length !== 2) throw new Error("Viewer template must contain exactly one PNG codec import.");
  const codec = readFileSync(new URL("../assets/png.mjs", import.meta.url), "utf8");
  if (/<\/script/i.test(codec)) throw new Error("PNG codec cannot contain an HTML script closing tag.");
  const embeddedCodec = "const { embedSnapshot, extractSnapshot } = (() => {\n" + codec.replace(/^export /gm, "") + "\nreturn { embedSnapshot, extractSnapshot };\n})();";
  const encoded = JSON.stringify(entries).replaceAll("<", "\\u003c");
  const html = template.replace(codecImport, () => embeddedCodec).replace(marker, () => '<script id="board-data" type="application/json">' + encoded + "</script>");
  const destination = resolve(outputDirectory);
  const targets = [resolve(destination, "index.html"), resolve(destination, "validation-report.json")];
  if (inputs.some(input => targets.includes(resolve(input)))) throw new Error("Delivery would overwrite an input file.");
  const report = {
    viewerRevision: /quickdraw@([a-f0-9]{40})\//.exec(template)?.[1] || null,
    scope: "Native snapshot and supported shape properties; finite basic geometry and estimated card text height. No browser rendering, font, overlap, or route checks.",
    results
  };
  mkdirSync(destination, { recursive: true });
  inputs.forEach(input => {
    const target = resolve(destination, basename(input));
    if (resolve(input) !== target) copyFileSync(input, target);
  });
  writeFileSync(targets[0], html);
  writeFileSync(targets[1], JSON.stringify(report, null, 2) + "\n");
  return { directory: destination, viewer: targets[0], files: results.map(result => result.file), report: targets[1] };
}

function main(args) {
  const usage = "Usage: node <skill>/scripts/package.mjs <board.json> [more.json ...] --out <directory>";
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage);
    return;
  }
  let output;
  const inputs = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out") {
      output = args[++i];
      if (!output || output.startsWith("--")) throw new Error("--out requires a directory.\n" + usage);
    } else if (args[i].startsWith("-")) throw new Error("Unknown option: " + args[i] + "\n" + usage);
    else inputs.push(args[i]);
  }
  if (!output || !inputs.length) throw new Error(usage);
  console.log(JSON.stringify(packageBoards(inputs, output), null, 2));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
