import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { embedSnapshot, extractSnapshot } from "../assets/png.mjs";

const root = process.env.QUICKDRAW_NVIM_DIR;

test("JavaScript and quickdraw.nvim Lua artifacts restore the same native records in both directions", { skip: !root && "Set QUICKDRAW_NVIM_DIR to enable native Lua interoperability checks." }, () => {
  const directory = mkdtempSync(join(tmpdir(), "quickdraw-png-compat-"));
  try {
    const plain = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=", "base64"));
    const snapshot = { document: { store: {
      "shape:unicode": { id: "shape:unicode", typeName: "shape", type: "text", x: 20, y: 30, rot: 0, z: 10, props: { text: "繁體中文 🎨\n重新編輯", w: 400, scale: 1, autosize: false } },
      "asset:example": { id: "asset:example", typeName: "asset", src: "data:image/png;base64," + Buffer.from(plain).toString("base64"), w: 1, h: 1 }
    } } };
    writeFileSync(join(directory, "plain.png"), plain);
    writeFileSync(join(directory, "javascript.png"), embedSnapshot(plain, snapshot));
    writeFileSync(join(directory, "snapshot.json"), JSON.stringify(snapshot));
    const script = `package.path = os.getenv("QUICKDRAW_COMPAT_ROOT") .. "/lua/?.lua;" .. package.path
local png = require("quickdraw.png")
local directory = os.getenv("QUICKDRAW_COMPAT_OUTPUT")
local function read(name)
  local file = assert(io.open(directory .. "/" .. name, "rb"))
  local bytes = file:read("*a")
  file:close()
  return bytes
end
local function write(name, bytes)
  local file = assert(io.open(directory .. "/" .. name, "wb"))
  assert(file:write(bytes))
  file:close()
end
local expected = vim.json.decode(read("snapshot.json"))
local snapshot, extract_error = png.extract_snapshot(read("javascript.png"))
assert(not extract_error, vim.inspect(extract_error))
assert(vim.deep_equal(snapshot, expected), "JavaScript PNG snapshot differs")
write("extracted.json", vim.json.encode(snapshot))
local encoded, embed_error = png.embed_snapshot(read("plain.png"), expected)
assert(encoded, vim.inspect(embed_error))
write("lua.png", encoded)
`;
    const scriptPath = join(directory, "check.lua");
    writeFileSync(scriptPath, script);
    const result = spawnSync(process.env.NVIM_BIN || "nvim", ["--headless", "-u", "NONE", "-i", "NONE", "-n", "-l", scriptPath], {
      encoding: "utf8", timeout: 30000,
      env: { ...process.env, QUICKDRAW_COMPAT_ROOT: resolve(root), QUICKDRAW_COMPAT_OUTPUT: directory }
    });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(directory, "extracted.json"), "utf8")), snapshot);
    assert.deepEqual(extractSnapshot(new Uint8Array(readFileSync(join(directory, "lua.png")))), snapshot);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
