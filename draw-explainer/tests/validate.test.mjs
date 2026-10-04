import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createBoard, wrapText, FONT_SIZES } from "../scripts/board.mjs";
import { validateSnapshot } from "../scripts/validate.mjs";

function specimen() {
  const board = createBoard("test");
  board.box("input", 20, 30, 300, 160, "Input\nEvidence", { color: "blue" });
  board.text("heading", 20, 0, 500, "A native Quickdraw board", { size: "m" });
  board.arrow("relation", 325, 110, 425, 110, { color: "green" });
  board.line("divider", 20, 230, 600, 230, { color: "grey" });
  return board.snapshot();
}

test("accepts a JSON round-trip of all supported example records", () => {
  const snapshot = JSON.parse(JSON.stringify(specimen()));
  const result = validateSnapshot(snapshot);
  assert.equal(result.records, 4);
  assert.deepEqual(result.counts, { geo: 1, text: 1, arrow: 1, line: 1 });
  assert.equal(result.basicGeometry, true);
  assert.equal(result.browserRendering, false);
  assert.ok(result.estimatedBounds.w > 0 && result.estimatedBounds.h > 0);
});

test("requires the native snapshot envelope rather than a semantic graph", () => {
  assert.throws(() => validateSnapshot({ nodes: [], edges: [] }), /document/);
  assert.throws(() => validateSnapshot({ document: { store: {} } }), /contain shapes/);
});

test("rejects record identity mismatches and unsupported shape properties", () => {
  const identity = specimen();
  identity.document.store["shape:test:input"].id = "different";
  assert.throws(() => validateSnapshot(identity), /match store key/);
  for (const [property, value] of [["color", "purple"], ["size", "large"], ["geo", "unsupported"]]) {
    const snapshot = specimen();
    snapshot.document.store["shape:test:input"].props[property] = value;
    assert.throws(() => validateSnapshot(snapshot), /unsupported/);
  }
});

test("rejects nonfinite coordinates, invalid dimensions, and zero-length connectors", () => {
  const nonfinite = specimen();
  nonfinite.document.store["shape:test:input"].x = Infinity;
  assert.throws(() => validateSnapshot(nonfinite), /finite/);
  const dimension = specimen();
  dimension.document.store["shape:test:input"].props.w = -2;
  assert.throws(() => validateSnapshot(dimension), /positive/);
  const connector = specimen();
  Object.assign(connector.document.store["shape:test:relation"].props, { dx: 0, dy: 0 });
  assert.throws(() => validateSnapshot(connector), /zero-length/);
});

test("rejects estimated text overflow instead of claiming a readable rendering", () => {
  const snapshot = specimen();
  snapshot.document.store["shape:test:input"].props.label = "Long\nLong\nLong\nLong\nLong\nLong";
  assert.throws(() => validateSnapshot(snapshot), /text height/);
  const board = createBoard("overflow");
  assert.throws(() => board.box("small", 0, 0, 120, 30, "Long content"), /height/);
});

test("preserves text while inserting explicit line breaks for CJK", () => {
  const input = "從觀察建立共同理解";
  const wrapped = wrapText(input, 70, 20);
  assert.ok(wrapped.includes("\n"));
  assert.equal(wrapped.replaceAll("\n", ""), input);
});

test("rejects duplicate shape IDs at generation time", () => {
  const board = createBoard("duplicates");
  board.text("heading", 0, 0, 400, "First");
  assert.throws(() => board.text("heading", 0, 40, 400, "Second"), /Duplicate/);
});

test("preserves explicit newlines and spaces, including CJK content", () => {
  const input = "中文第一行\n\n中文 第二行 \n";
  assert.equal(wrapText(input, 1000, FONT_SIZES.s), input);
  const board = createBoard("cjk");
  const record = board.box("label", 0, 0, 1000, 300, input);
  assert.equal(record.props.label, input);
  assert.equal(validateSnapshot(board.snapshot()).records, 1);
  assert.throws(() => wrapText("text", 0, 20), /width/);
  assert.throws(() => wrapText("text", 100, NaN), /size/);
});

test("accepts genuinely empty boundary labels even in small boxes", () => {
  const board = createBoard("boundary");
  board.box("empty", 0, 0, 10, 10, "");
  assert.equal(validateSnapshot(board.snapshot()).textCharacters, 0);
});

test("rejects invalid identity, rotation, numeric types, props, and derived overflow", () => {
  for (const [field, value, pattern] of [["x", "1", /number/], ["y", NaN, /finite/], ["rot", 1, /unrotated/], ["z", Infinity, /finite/], ["typeName", "page", /shape/]]) {
    const snapshot = specimen();
    snapshot.document.store["shape:test:input"][field] = value;
    assert.throws(() => validateSnapshot(snapshot), pattern);
  }
  for (const [field, value] of [["dash", "unknown"], ["fill", "unknown"], ["font", "unknown"], ["labelSize", "unknown"], ["label", null], ["h", 0]]) {
    const snapshot = specimen();
    snapshot.document.store["shape:test:input"].props[field] = value;
    assert.throws(() => validateSnapshot(snapshot));
  }
  const snapshot = specimen();
  snapshot.document.store["shape:test:heading"].props.scale = Number.MAX_VALUE;
  assert.throws(() => validateSnapshot(snapshot), /finite/);
  const invalid = specimen();
  invalid.document.store.invalid = { ...invalid.document.store["shape:test:input"], id: "invalid" };
  assert.throws(() => validateSnapshot(invalid), /shape:/);
});

const cli = fileURLToPath(new URL("../scripts/validate.mjs", import.meta.url));
function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
}

test("CLI requires inputs and option values, and provides help", () => {
  for (const args of [[], ["--report"], ["--core-dir"], ["--report", "--core-dir"], ["--unknown"]]) {
    const result = run(args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Usage:/);
  }
  const help = run(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage:/);
});

test("builder save and CLI report preserve inputs and emit no partial output", () => {
  const dir = mkdtempSync(join(tmpdir(), "quickdraw-test-"));
  try {
    const input = join(dir, "nested", "board.json");
    const invalid = join(dir, "invalid.json");
    const report = join(dir, "report.json");
    const board = createBoard("saved");
    board.box("label", 0, 0, 300, 160, "中文\n標籤");
    assert.equal(board.save(input), 1);
    assert.deepEqual(JSON.parse(readFileSync(input, "utf8")), board.snapshot());
    const success = run([input, "--report", report]);
    assert.equal(success.status, 0, success.stderr);
    const output = JSON.parse(success.stdout);
    assert.deepEqual(JSON.parse(readFileSync(report, "utf8")), output);
    assert.equal(output.results[0].records, 1);
    assert.equal(output.nativeStoreSource, null);
    assert.equal(output.schemaReference.quickdrawPackageVersion, "0.2.0");
    writeFileSync(invalid, "{}");
    const prior = readFileSync(report, "utf8");
    const failed = run([input, invalid, "--report", report]);
    assert.equal(failed.status, 1);
    assert.equal(failed.stdout, "");
    assert.ok(failed.stderr.includes(invalid));
    assert.equal(readFileSync(report, "utf8"), prior);
    const absent = join(dir, "absent.json");
    assert.equal(run([invalid, "--report", absent]).status, 1);
    assert.equal(existsSync(absent), false);
    assert.equal(run([input, "--report", input]).status, 1);
    assert.deepEqual(JSON.parse(readFileSync(input, "utf8")), board.snapshot());
    assert.equal(run([join(dir, "missing.json")]).status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
