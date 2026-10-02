import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const script = resolve(here, "../scripts/assemble.mjs");
const starter = resolve(here, "../assets/explainer-template.html");
const gsapUrl = "https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js";
const markerSrc = { player: "./player.js", animations: "./animation-helpers.js" };

const temporaryDirectories = [];
after(() => temporaryDirectories.forEach(path => rmSync(path, { recursive: true, force: true })));

function tempDir() {
  const path = mkdtempSync(join(tmpdir(), "gsap-assemble-"));
  temporaryDirectories.push(path);
  return path;
}

function inlineRuntime(html) {
  const context = { window: {} };
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (match[1].trim()) runInNewContext(match[1], context);
  }
  return context.window;
}

function draftHtml(utilities) {
  const markers = (utilities || ["player", "animations"])
    .map((name) => '  <script data-explainer-util="' + name + '" src="' + markerSrc[name] + '"></script>')
    .join("\n");
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    "<title>Draft</title>",
    "<style>.authored { color: teal; }</style>",
    "</head>",
    "<body>",
    '  <h1 class="authored">Custom authored claim</h1>',
    '  <p data-authored>Keep <em>this</em> text and layout.</p>',
    markers,
    '  <script src="' + gsapUrl + '"></script>',
    "</body>",
    "</html>",
    ""
  ].join("\n");
}

function runAssemble(draft, output, cwd) {
  return spawnSync(process.execPath, [script, draft, output], {
    cwd: cwd || tmpdir(),
    encoding: "utf8"
  });
}

test("inlines utilities from an unrelated working directory into a created directory", () => {
  const dir = tempDir();
  const draft = join(dir, "draft.html");
  const output = join(dir, "nested", "deep", "index.html");
  writeFileSync(draft, draftHtml());
  const result = runAssemble(draft, output, tempDir());

  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(output), "output file was created, including its parent directories");

  const html = readFileSync(output, "utf8");
  const runtime = inlineRuntime(html);
  assert.equal(typeof runtime.ExplainerPlayer.create, "function", "inlined player exposes its public factory");
  assert.equal(typeof runtime.ExplainerAnimations.draw, "function", "inlined helpers expose path drawing");
  assert.doesNotMatch(html, /data-explainer-util/, "markers are replaced, not left behind");
  assert.doesNotMatch(html, /src="\.\/player\.js"/, "no external utility reference remains");
});

test("preserves authored layout, text, pinned GSAP, and script boundaries", () => {
  const dir = tempDir();
  const draft = join(dir, "draft.html");
  const output = join(dir, "index.html");
  writeFileSync(draft, draftHtml(["player"]));
  const result = runAssemble(draft, output, tempDir());
  assert.equal(result.status, 0, result.stderr);

  const html = readFileSync(output, "utf8");
  assert.match(html, /Custom authored claim/, "authored heading survives");
  assert.match(html, /Keep <em>this<\/em> text and layout\./, "authored inline markup survives");
  assert.match(html, /\.authored \{ color: teal; \}/, "authored CSS survives");
  assert.ok(html.includes(gsapUrl), "pinned GSAP URL survives");
  const closings = html.match(/<\/script>/g) || [];
  const openings = html.match(/<script\b/g) || [];
  assert.equal(openings.length, closings.length, "every opened script closes exactly once");
});

test("allows the optional animations marker to be omitted", () => {
  const dir = tempDir();
  const draft = join(dir, "draft.html");
  const output = join(dir, "index.html");
  writeFileSync(draft, draftHtml(["player"]));
  const result = runAssemble(draft, output, tempDir());
  assert.equal(result.status, 0, result.stderr);

  const html = readFileSync(output, "utf8");
  const runtime = inlineRuntime(html);
  assert.equal(typeof runtime.ExplainerPlayer.create, "function");
  assert.equal(runtime.ExplainerAnimations, undefined);
});

test("assembles the packaged starter into a single file", () => {
  const dir = tempDir();
  const output = join(dir, "index.html");
  const result = runAssemble(starter, output, tempDir());
  assert.equal(result.status, 0, result.stderr);

  const html = readFileSync(output, "utf8");
  assert.doesNotMatch(html, /data-explainer-util/, "starter markers are replaced");
  assert.match(html, /ExplainerPlayer\.create/);
  assert.match(html, /ExplainerAnimations/);
  assert.ok(html.includes(gsapUrl), "pinned GSAP URL preserved in the assembled starter");
  assert.match(html, /id="scene-claim"/, "authored scene markup preserved");
});

test("rejects an unknown utility marker with an actionable error", () => {
  const dir = tempDir();
  const draft = join(dir, "draft.html");
  const output = join(dir, "index.html");
  writeFileSync(draft, draftHtml(["mystery"]));
  const result = runAssemble(draft, output, tempDir());

  assert.notEqual(result.status, 0, "unknown marker fails");
  assert.match(result.stderr, /mystery/, "error names the unknown marker");
  assert.match(result.stderr, /player/, "error lists the known utilities");
  assert.ok(!existsSync(output), "no partial output is written");
});

test("reports usage for missing arguments", () => {
  const result = spawnSync(process.execPath, [script], { cwd: tmpdir(), encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage:/);
});

test("reports a missing draft file", () => {
  const dir = tempDir();
  const result = runAssemble(join(dir, "missing.html"), join(dir, "out.html"), tempDir());
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not found/i);
});

test("rejects unknown single-quoted markers without writing partial output", () => {
  const dir = tempDir();
  const draft = join(dir, "draft.html");
  const output = join(dir, "index.html");
  writeFileSync(draft, "<script data-explainer-util='unknown'></script>");
  const result = runAssemble(draft, output);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown/);
  assert.ok(!existsSync(output));
});

test("embedded closing-script text cannot terminate a utility or change its value", () => {
  const dir = tempDir();
  const scripts = join(dir, "scripts");
  const assets = join(dir, "assets");
  mkdirSync(scripts);
  mkdirSync(assets);
  const copiedScript = join(scripts, "assemble.mjs");
  writeFileSync(copiedScript, readFileSync(script));
  writeFileSync(join(assets, "player.js"), 'window.proof = "before </ScRiPt> after";');
  const draft = join(dir, "draft.html");
  const output = join(dir, "index.html");
  writeFileSync(draft, "<script data-explainer-util='player' src='./player.js'></script>");
  const result = spawnSync(process.execPath, [copiedScript, draft, output], { cwd: tmpdir(), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(inlineRuntime(readFileSync(output, "utf8")).proof, "before </ScRiPt> after");
});
