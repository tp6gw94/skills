import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { FONT_SIZES } from "./board.mjs";

const colors = new Set(["black", "grey", "light-violet", "violet", "blue", "light-blue", "yellow", "orange", "green", "light-green", "light-red", "red"]);
const sizes = new Set(["s", "m", "l", "xl"]);
const dashes = new Set(["draw", "solid", "dashed", "dotted"]);
const fills = new Set(["none", "semi", "solid", "pattern"]);
const fonts = new Set(["draw", "sans", "serif", "mono"]);
const geometries = new Set(["rectangle", "ellipse", "triangle", "diamond", "hexagon", "star", "cloud"]);

function object(value, name) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), name + " must be an object");
}
function finite(value, name) {
  assert.equal(typeof value, "number", name + " must be a number");
  assert.ok(Number.isFinite(value), name + " must be finite");
}
function positive(value, name) {
  finite(value, name);
  assert.ok(value > 0, name + " must be positive");
}
function member(value, allowed, name) {
  assert.ok(allowed.has(value), name + " has an unsupported value: " + value);
}

export function validateSnapshot(snapshot) {
  object(snapshot, "snapshot");
  assert.deepEqual(Object.keys(snapshot), ["document"], "native snapshot must contain only document");
  object(snapshot.document, "document");
  assert.deepEqual(Object.keys(snapshot.document), ["store"], "document must contain only store");
  object(snapshot.document.store, "document.store");
  const records = Object.entries(snapshot.document.store);
  assert.ok(records.length > 0, "snapshot must contain shapes");
  const counts = { geo: 0, text: 0, arrow: 0, line: 0 };
  const text = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [key, record] of records) {
    object(record, key);
    assert.ok(key.startsWith("shape:") && key.length > 6, "shape record ID must start with shape: and have a suffix");
    assert.equal(record.id, key, "record ID must match store key");
    assert.equal(record.typeName, "shape", "validator supports shape records only");
    member(record.type, new Set(Object.keys(counts)), key + ".type");
    for (const field of ["x", "y", "rot", "z"]) finite(record[field], key + "." + field);
    assert.equal(record.rot, 0, "geometry checks support unrotated shapes only");
    object(record.props, key + ".props");
    const p = record.props;
    member(p.color, colors, key + ".color");
    member(p.size, sizes, key + ".size");
    member(p.dash, dashes, key + ".dash");
    member(p.fill, fills, key + ".fill");
    member(p.font, fonts, key + ".font");
    let x = record.x, y = record.y, w, h;
    if (record.type === "geo") {
      member(p.geo, geometries, key + ".geo");
      positive(p.w, key + ".w");
      positive(p.h, key + ".h");
      member(p.labelSize, sizes, key + ".labelSize");
      assert.equal(typeof p.label, "string", key + ".label must be text");
      const estimatedHeight = p.label ? p.label.split("\n").length * FONT_SIZES[p.labelSize] * 1.3 : 0;
      assert.ok(!p.label || estimatedHeight <= p.h - 28, key + " exceeds its estimated text height");
      text.push(p.label);
      w = p.w; h = p.h;
    } else if (record.type === "text") {
      assert.equal(typeof p.text, "string", key + ".text must be text");
      assert.ok(p.text.length, key + ".text must not be empty");
      positive(p.w, key + ".w");
      positive(p.scale, key + ".scale");
      assert.equal(p.autosize, false, key + " must use an explicit text width");
      member(p.align, new Set(["start", "middle", "end"]), key + ".align");
      text.push(p.text);
      w = p.w; h = p.text.split("\n").length * FONT_SIZES[p.size] * p.scale * 1.32;
    } else {
      finite(p.dx, key + ".dx");
      finite(p.dy, key + ".dy");
      finite(p.bend, key + ".bend");
      assert.ok(Math.hypot(p.dx, p.dy) > 0, key + " cannot be zero-length");
      x += Math.min(0, p.dx) - Math.abs(p.bend);
      y += Math.min(0, p.dy) - Math.abs(p.bend);
      w = Math.abs(p.dx) + Math.abs(p.bend) * 2;
      h = Math.abs(p.dy) + Math.abs(p.bend) * 2;
    }
    for (const [name, value] of Object.entries({ x, y, w, h, right: x + w, bottom: y + h })) finite(value, key + ".estimatedBounds." + name);
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
    counts[record.type]++;
  }
  finite(maxX - minX, "estimatedBounds.w");
  finite(maxY - minY, "estimatedBounds.h");
  return {
    records: records.length, counts,
    estimatedBounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    textCharacters: text.join("").length,
    nativeSnapshotContract: true,
    shapePropsContract: true,
    unrotatedRecordsOnly: true,
    textHeightEstimateOnly: true,
    basicGeometry: true,
    browserRendering: false
  };
}

const scope = "Native snapshot envelope and geo/text/arrow/line props; unrotated records only; finite numeric geometry and estimated text height. No font, overlap, route, or browser rendering checks.";
const usage = "Usage: node validate.mjs <snapshot.json> [more.json ...] [--report <report.json>] [--core-dir <quickdraw/packages/core>]\nValidates all inputs before emitting a report. --core-dir optionally checks a native Store round-trip using caller-supplied source, not a verified pinned revision.";

async function main(args) {
  if (args.includes("--help")) {
    console.log(usage);
    return;
  }
  const files = [];
  let coreDirectory;
  let reportPath;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--core-dir" || arg === "--report") {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(arg + " requires a path\n" + usage);
      if (arg === "--core-dir") coreDirectory = value;
      else reportPath = value;
    } else if (arg.startsWith("--")) throw new Error("Unknown option: " + arg + "\n" + usage);
    else files.push(arg);
  }
  if (!files.length) throw new Error("At least one input JSON path is required\n" + usage);
  if (reportPath && files.some(file => resolve(file) === resolve(reportPath))) throw new Error("Report path must not overwrite an input JSON file");
  let Store;
  if (coreDirectory) ({ Store } = await import(pathToFileURL(resolve(coreDirectory, "src/store.js"))));
  const results = [];
  for (const file of files) {
    try {
      const snapshot = JSON.parse(readFileSync(file, "utf8"));
      const result = { file, ...validateSnapshot(snapshot), quickdrawStoreRoundTrip: false };
      if (Store) {
        const store = new Store();
        store.loadSnapshot(snapshot);
        assert.deepEqual(store.getSnapshot(), snapshot, "Quickdraw Store must preserve all records");
        result.quickdrawStoreRoundTrip = true;
      }
      results.push(result);
    } catch (error) {
      throw new Error(file + ": " + error.message);
    }
  }
  const report = {
    schemaReference: { quickdrawRevision: "dd653639aec1212c9ec5704e2eafd2a75560a0af", quickdrawPackageVersion: "0.2.0" },
    nativeStoreSource: coreDirectory ? { coreDirectory: resolve(coreDirectory), provenance: "caller-supplied", pinnedRevisionVerified: false } : null,
    scope,
    results
  };
  if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
