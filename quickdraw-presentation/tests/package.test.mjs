import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createBoard } from "../scripts/board.mjs";
import { packageBoards } from "../scripts/package.mjs";

const directories = [];
after(() => directories.forEach(directory => rmSync(directory, { recursive: true, force: true })));
function temporary() {
  const directory = mkdtempSync(join(tmpdir(), "quickdraw-package-"));
  directories.push(directory);
  return directory;
}
function input(directory, name, content = "A native board") {
  const board = createBoard(name);
  board.text("title", 20, 20, 1200, content);
  const path = join(directory, name + ".json");
  board.save(path);
  return path;
}
function data(html) {
  const match = /<script id="board-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(match, "embedded board data is present");
  return JSON.parse(match[1]);
}

test("packages any topic names with native copies, embedded data, and honest evidence", () => {
  const directory = temporary();
  const paths = [input(directory, "custom-system"), input(directory, "another-topic")];
  const target = join(directory, "delivery");
  const result = packageBoards(paths, target);
  const html = readFileSync(result.viewer, "utf8");
  const entries = data(html);
  assert.deepEqual(entries.map(entry => entry.name), ["custom-system", "another-topic"]);
  entries.forEach((entry, index) => {
    assert.deepEqual(entry.snapshot, JSON.parse(readFileSync(paths[index], "utf8")));
    assert.equal(readFileSync(join(target, result.files[index]), "utf8"), readFileSync(paths[index], "utf8"));
  });
  assert.doesNotMatch(html, /samples\.js|codemode-sandbox|llm-attention|react-compiler/);
  assert.match(html, /quickdraw@[a-f0-9]{40}\//);
  const report = JSON.parse(readFileSync(result.report, "utf8"));
  assert.equal(report.results.length, 2);
  assert.ok(report.results.every(item => item.browserRendering === false && item.quickdrawStoreRoundTrip === false));
});

test("embedded authored text cannot close a script and survives JSON parsing", () => {
  const directory = temporary();
  const content = "</ScRiPt><script>unexpected()</script> & $& $1";
  const path = input(directory, "literal-text", content);
  const result = packageBoards([path], join(directory, "out"));
  const html = readFileSync(result.viewer, "utf8");
  const snapshot = data(html)[0].snapshot;
  assert.equal(Object.values(snapshot.document.store)[0].props.text, content);
  assert.doesNotMatch(html, /<script>unexpected\(\)<\/script>/);
});

test("validates every input before creating delivery output", () => {
  const directory = temporary();
  const first = input(directory, "valid");
  const invalid = join(directory, "invalid.json");
  writeFileSync(invalid, JSON.stringify({ nodes: [] }));
  const target = join(directory, "out");
  assert.throws(() => packageBoards([first, invalid], target));
  assert.equal(existsSync(target), false);
});

test("rejects duplicate or reserved filenames without changing input files", () => {
  const directory = temporary();
  const nested = join(directory, "nested");
  mkdirSync(nested);
  const first = input(directory, "same");
  const second = input(nested, "same");
  assert.throws(() => packageBoards([first, second], join(directory, "out")), /Conflicting/);
  const reserved = input(directory, "validation-report");
  assert.throws(() => packageBoards([reserved], join(directory, "out")), /Conflicting/);
  assert.equal(existsSync(join(directory, "out")), false);
});

test("repackaging refreshes embedded data and permits JSON already in delivery directory", () => {
  const directory = temporary();
  const path = input(directory, "diagram", "First");
  const first = packageBoards([path], directory);
  assert.equal(Object.values(data(readFileSync(first.viewer, "utf8"))[0].snapshot.document.store)[0].props.text, "First");
  input(directory, "diagram", "Changed");
  const second = packageBoards([path], directory);
  assert.equal(Object.values(data(readFileSync(second.viewer, "utf8"))[0].snapshot.document.store)[0].props.text, "Changed");
});

test("CLI explains missing arguments and succeeds from an unrelated working directory", () => {
  const script = fileURLToPath(new URL("../scripts/package.mjs", import.meta.url));
  const missing = spawnSync(process.execPath, [script], { encoding: "utf8", cwd: tmpdir() });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /Usage:/);
  const directory = temporary();
  const path = input(directory, "topic");
  const target = join(directory, "delivery");
  const result = spawnSync(process.execPath, [script, path, "--out", target], { encoding: "utf8", cwd: tmpdir() });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(join(target, "index.html")));
});

test("packaged viewer module has valid JavaScript syntax without browser execution", () => {
  const directory = temporary();
  const result = packageBoards([input(directory, "syntax")], join(directory, "out"));
  const html = readFileSync(result.viewer, "utf8");
  const source = /<script type="module">([\s\S]*?)<\/script>/.exec(html)[1];
  const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stderr);
});
