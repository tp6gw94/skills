import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createBoard } from "../scripts/board.mjs";
import { packageBoards } from "../scripts/package.mjs";
import { embedSnapshot, extractSnapshot } from "../assets/png.mjs";

const directories = [];
const plainPng = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=", "base64"));
after(() => directories.forEach(directory => rmSync(directory, { recursive: true, force: true })));

function snapshot(name = "First") {
  const board = createBoard(name);
  board.text("label", 0, 0, 600, name);
  return board.snapshot();
}

class Element {
  constructor() {
    this.disabled = true;
    this.value = "";
    this.files = [];
    this.children = [];
    this.events = new Map();
    this.textContent = "";
    this.inert = false;
  }
  appendChild(element) { this.children.push(element); }
  addEventListener(name, handler) { this.events.set(name, handler); }
  async emit(name, event = {}) { return this.events.get(name)?.(event); }
  blur() {}
  remove() {}
}

async function viewer({ exportImage, fonts, bounds = { x: 100, y: 200, w: 1600, h: 1200 }, viewport = { w: 1000, h: 800 } } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "quickdraw-viewer-"));
  directories.push(directory);
  const paths = ["First", "Second"].map(name => {
    const board = createBoard(name);
    board.text("label", 0, 0, 600, name);
    const path = join(directory, name + ".json");
    board.save(path);
    return path;
  });
  const result = packageBoards(paths, join(directory, "out"));
  const html = readFileSync(result.viewer, "utf8");
  const data = /<script id="board-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)[1];
  const elements = Object.fromEntries(["status", "boards", "file", "fit", "save", "export-png", "board", "board-data"].map(id => [id, new Element()]));
  elements["board-data"].textContent = data;
  const downloads = [];
  const urls = new Map();
  const window = new Element();
  let current;
  let userListener;
  const store = {
    getSnapshot: () => structuredClone(current),
    loadSnapshot: value => { current = structuredClone(value); },
    listen: (handler, options) => { assert.equal(options.source, "user"); userListener = handler; }
  };
  const imageOptions = [];
  let camera;
  const editor = {
    store,
    fitContent({ margin = 0.08, maxZoom = 1 } = {}) {
      const inset = Math.min(viewport.w, viewport.h) * margin;
      const z = Math.max(0.05, Math.min(8, maxZoom, (viewport.w - 2 * inset) / bounds.w, (viewport.h - 2 * inset) / bounds.h));
      camera = { z, x: viewport.w / 2 / z - (bounds.x + bounds.w / 2), y: viewport.h / 2 / z - (bounds.y + bounds.h / 2) };
    },
    setTool() {},
    exportImage: async options => {
      imageOptions.push(options);
      return exportImage ? exportImage(store) : new Blob([plainPng], { type: "image/png" });
    }
  };
  const document = {
    querySelector: selector => elements[selector.slice(1)],
    body: new Element(),
    activeElement: new Element(),
    fonts: { ready: fonts || Promise.resolve() },
    createElement: tag => {
      const element = new Element();
      if (tag === "a") element.click = () => downloads.push({ filename: element.download, blob: urls.get(element.href) });
      return element;
    }
  };
  const URL = {
    createObjectURL: blob => { const key = "blob:" + urls.size; urls.set(key, blob); return key; },
    revokeObjectURL: key => urls.delete(key)
  };
  const sdk = { createQuickdraw: () => ({ editor }) };
  const moduleSource = /<script type="module">([\s\S]*?)<\/script>/.exec(html)[1];
  assert.doesNotMatch(moduleSource, /from "\.\/png\.mjs"/);
  const source = moduleSource.replace(/await import\("https:\/\/cdn\.jsdelivr\.net\/gh\/quickdrawjs\/quickdraw@[a-f0-9]{40}\/packages\/core\/src\/index\.js"\)/, "sdk");
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction("document", "window", "URL", "sdk", "setTimeout", source)(document, window, URL, sdk, () => {});
  assert.equal(elements["export-png"].disabled, false, elements.status.textContent);
  return {
    elements, downloads, imageOptions, window,
    current: () => structuredClone(current),
    camera: () => structuredClone(camera),
    edit: value => { current = structuredClone(value); userListener(); },
    click: id => elements[id].emit("click"),
    select: async index => { elements.boards.value = String(index); await elements.boards.emit("change"); },
    upload: async (name, bytes, type = "image/png") => {
      elements.file.files = [{ name, type, arrayBuffer: async () => bytes.slice().buffer, text: async () => new TextDecoder().decode(bytes) }];
      await elements.file.emit("change");
    }
  };
}

async function decodedDownload(app) {
  const download = app.downloads.at(-1);
  return { filename: download.filename, snapshot: extractSnapshot(new Uint8Array(await download.blob.arrayBuffer())) };
}

test("initial load, board switching, file opening and refocus frame the diagram instead of extreme zoom-out", async () => {
  const bounds = { x: 100, y: 200, w: 1600, h: 1200 };
  const viewport = { w: 1000, h: 800 };
  const app = await viewer({ bounds, viewport });
  const framed = () => {
    const camera = app.camera();
    assert.equal(camera.z, 0.545);
    assert.ok(Math.abs((bounds.x + bounds.w / 2 + camera.x) * camera.z - viewport.w / 2) < 1e-9);
    assert.ok(Math.abs((bounds.y + bounds.h / 2 + camera.y) * camera.z - viewport.h / 2) < 1e-9);
    const left = (bounds.x + camera.x) * camera.z;
    const top = (bounds.y + camera.y) * camera.z;
    assert.ok(left >= 64 - 1e-9 && top >= 64 - 1e-9);
    assert.ok(left + bounds.w * camera.z <= viewport.w - 64 + 1e-9);
    assert.ok(top + bounds.h * camera.z <= viewport.h - 64 + 1e-9);
  };
  framed();
  await app.select(1);
  framed();
  await app.upload("reopened.png", embedSnapshot(plainPng, snapshot()));
  framed();
  await app.click("fit");
  framed();
});

test("a small diagram stays centered at normal scale rather than being magnified to fill the screen", async () => {
  const bounds = { x: 20, y: 30, w: 50, h: 40 };
  const app = await viewer({ bounds });
  const camera = app.camera();
  assert.equal(camera.z, 1);
  assert.equal((bounds.x + bounds.w / 2 + camera.x) * camera.z, 500);
  assert.equal((bounds.y + bounds.h / 2 + camera.y) * camera.z, 400);
});

test("packaged controls export the latest whole board as editable PNG and reopen it", async () => {
  const app = await viewer();
  const edited = snapshot("修改後的繁體中文");
  app.edit(edited);
  await app.click("export-png");
  assert.equal(app.downloads[0].blob.type, "image/png");
  assert.deepEqual(await decodedDownload(app), { filename: "First.png", snapshot: edited });
  assert.deepEqual(app.imageOptions, [{ background: true, ids: null }]);
  await app.select(1);
  const bytes = new Uint8Array(await app.downloads[0].blob.arrayBuffer());
  await app.upload("RESTORED.PNG", bytes);
  assert.deepEqual(app.current(), edited);
  app.edit(snapshot("Second edit"));
  await app.click("export-png");
  assert.deepEqual(await decodedDownload(app), { filename: "RESTORED.png", snapshot: snapshot("Second edit") });
});

test("ordinary PNG, corrupt bytes and invalid snapshots leave the current board intact", async () => {
  const app = await viewer();
  const before = app.current();
  await app.upload("ordinary.png", plainPng);
  assert.match(app.elements.status.textContent, /沒有 Quickdraw 編輯資料/);
  assert.deepEqual(app.current(), before);
  await app.upload("broken.png", new Uint8Array([1, 2, 3]));
  assert.match(app.elements.status.textContent, /載入失敗/);
  assert.deepEqual(app.current(), before);
  await app.upload("bad.json", new TextEncoder().encode('{"nodes":[]}'), "application/json");
  assert.match(app.elements.status.textContent, /缺少 document.store/);
  assert.deepEqual(app.current(), before);
  assert.equal(app.elements.file.value, "");
  assert.equal(app.elements["export-png"].disabled, false);
});

test("viewer toolbar shape types and embedded image assets survive PNG reopening", async () => {
  const app = await viewer();
  const extended = snapshot();
  for (const type of ["draw", "highlight", "note", "image"]) {
    const id = "shape:" + type;
    extended.document.store[id] = { id, typeName: "shape", type, x: 10, y: 20, rot: 0.2, z: 30, props: type === "image" ? { assetId: "asset:image", w: 10, h: 10 } : {} };
  }
  extended.document.store["asset:image"] = { id: "asset:image", typeName: "asset", src: "data:image/png;base64," + Buffer.from(plainPng).toString("base64"), w: 1, h: 1 };
  await app.upload("extended.png", embedSnapshot(plainPng, extended));
  assert.deepEqual(app.current(), extended);
  await app.click("save");
  assert.deepEqual(JSON.parse(await app.downloads.at(-1).blob.text()), extended);
});

test("switching boards keeps edits in memory and warns until each edited board is downloaded", async () => {
  const app = await viewer();
  const changed = snapshot("Changed");
  app.edit(changed);
  await app.select(1);
  await app.select(0);
  assert.deepEqual(app.current(), changed);
  let prevented = false;
  await app.window.emit("beforeunload", { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  await app.click("save");
  assert.deepEqual(JSON.parse(await app.downloads.at(-1).blob.text()), changed);
  prevented = false;
  await app.window.emit("beforeunload", { preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
});

test("export waits for fonts, blocks input and unlocks controls after completion", async () => {
  let release;
  const fonts = new Promise(resolve => { release = resolve; });
  const app = await viewer({ fonts });
  const operation = app.click("export-png");
  assert.equal(app.elements.board.inert, true);
  for (const id of ["boards", "file", "fit", "save", "export-png"]) assert.equal(app.elements[id].disabled, true);
  assert.equal(app.downloads.length, 0);
  release();
  await operation;
  assert.equal(app.elements.board.inert, false);
  assert.equal(app.elements["export-png"].disabled, false);
  assert.equal(app.downloads.length, 1);
});

test("empty board or rendering failure produces no bogus PNG and preserves JSON download", async () => {
  for (const exportImage of [async () => null, async () => { throw new Error("Canvas failed"); }]) {
    const app = await viewer({ exportImage });
    await app.click("export-png");
    assert.match(app.elements.status.textContent, /匯出失敗/);
    assert.equal(app.downloads.length, 0);
    assert.equal(app.elements.board.inert, false);
    assert.equal(app.elements["export-png"].disabled, false);
    await app.click("save");
    assert.equal(app.downloads.at(-1).filename, "First.json");
  }
});

test("changes during asynchronous PNG byte extraction preserve the unsaved warning", async () => {
  let app;
  app = await viewer({ exportImage: async () => ({
    arrayBuffer: async () => {
      app.edit(snapshot("Late edit"));
      return plainPng.slice().buffer;
    }
  }) });
  await app.click("export-png");
  assert.match(app.elements.status.textContent, /資料發生變更/);
  assert.equal(app.downloads.length, 0);
  assert.deepEqual(app.current(), snapshot("Late edit"));
  let prevented = false;
  await app.window.emit("beforeunload", { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(app.elements.board.inert, false);
});

test("a snapshot changed during image generation is not packaged as a misleading PNG", async () => {
  const app = await viewer({ exportImage: async store => {
    store.loadSnapshot(snapshot("Concurrent edit"));
    return new Blob([plainPng], { type: "image/png" });
  } });
  await app.click("export-png");
  assert.match(app.elements.status.textContent, /資料發生變更/);
  assert.equal(app.downloads.length, 0);
  assert.deepEqual(app.current(), snapshot("Concurrent edit"));
  assert.equal(app.elements["export-png"].disabled, false);
});
