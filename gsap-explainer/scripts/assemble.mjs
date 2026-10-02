#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const UTILITIES = new Map([
  ["player", "../assets/player.js"],
  ["animations", "../assets/animation-helpers.js"]
]);

const MARKER_PATTERN = /<script\b[^>]*\bdata-explainer-util\s*=\s*(["\'])([^"\']+)\1[^>]*>\s*<\/script>/gi;

function usage() {
  return [
    "Usage: node <skill>/scripts/assemble.mjs <draft.html> <output.html>",
    "",
    "Inlines the packaged explainer utilities marked in the draft into one file.",
    'Mark a utility with e.g. <script data-explainer-util="player" src="./player.js"></script>.',
    "Known utilities: " + [...UTILITIES.keys()].join(", ") + ".",
    "The output directory is created when it does not exist."
  ].join("\n");
}

function readUtility(name) {
  const path = fileURLToPath(new URL(UTILITIES.get(name), import.meta.url));
  return readFileSync(path, "utf8");
}

export function assemble(draftPath, outputPath) {
  const source = readFileSync(draftPath, "utf8");
  let inlined = 0;
  const output = source.replace(MARKER_PATTERN, (match, quote, rawName) => {
    const name = String(rawName).trim();
    if (!UTILITIES.has(name)) {
      throw new Error(
        'Unknown utility marker data-explainer-util="' + name + '". Known utilities: ' +
        [...UTILITIES.keys()].join(", ") + "."
      );
    }
    const utility = readUtility(name).replace(/<\/script/gi, (closing) => closing.replace("</", "<\\/"));
    inlined += 1;
    return "<script>\n" + utility.trim() + "\n</script>";
  });

  if (inlined === 0) {
    process.stderr.write("Warning: no data-explainer-util markers found; nothing was inlined.\n");
  }

  mkdirSync(dirname(resolve(outputPath)), { recursive: true });
  writeFileSync(outputPath, output, "utf8");
  return { outputPath, inlined };
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch (error) {
    return false;
  }
}

function main(argv) {
  if (argv.includes("-h") || argv.includes("--help")) {
    process.stdout.write(usage() + "\n");
    return 0;
  }
  const positional = argv.filter((arg) => !arg.startsWith("-"));
  if (positional.length !== 2) {
    process.stderr.write(usage() + "\n");
    return 1;
  }
  const [draft, output] = positional;
  if (!existsSync(draft)) {
    process.stderr.write("Error: draft not found: " + draft + "\n");
    return 1;
  }
  try {
    const result = assemble(draft, output);
    process.stdout.write("Assembled " + result.outputPath + " (" + result.inlined + " utilities inlined).\n");
    return 0;
  } catch (error) {
    process.stderr.write("Error: " + error.message + "\n");
    return 1;
  }
}

if (isDirectRun()) {
  process.exitCode = main(process.argv.slice(2));
}
