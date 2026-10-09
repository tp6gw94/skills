import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createBoard } from "../scripts/board.mjs";
import { packageBoards } from "../scripts/package.mjs";
import { embedSnapshot, extractSnapshot } from "../assets/png.mjs";
import { Element } from "./helpers/dom.mjs";

const directories = [];
const plainPng = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=", "base64"));
after(() => directories.forEach(directory => rmSync(directory, { recursive: true, force: true })));

function snapshot(name = "First") {
  const board = createBoard(name);
  board.text("label", 0, 0, 600, name);
  return board.snapshot();
}

async function viewer({ boardNames = ["First", "Second"], exportImage, fonts, fullscreenMode = "supported", bounds = { x: 100, y: 200, w: 1600, h: 1200 }, viewport = { w: 1000, h: 800 } } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "quickdraw-viewer-"));
  directories.push(directory);
  const paths = (boardNames.length ? boardNames : ["First"]).map(name => {
    const board = createBoard(name);
    board.text("label", 0, 0, 600, name);
    const path = join(directory, name + ".json");
    board.save(path);
    return path;
  });
  const result = packageBoards(paths, join(directory, "out"));
  const html = readFileSync(result.viewer, "utf8");
  const data = boardNames.length ? /<script id="board-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)[1] : "[]";
  const document = new Element("document");
  document.ownerDocument = document;
  document.body = new Element("body", document);
  document.appendChild(document.body);
  document.fullscreenElement = null;
  document.fonts = { ready: fonts || Promise.resolve() };
  const elements = Object.fromEntries(["previous", "next", "page-count", "status", "boards", "file", "read", "fit", "save", "export-png", "fullscreen", "board", "board-data"].map(id => {
    const tag = id === "boards" ? "select" : id === "file" ? "input" : id === "board" ? "main" : "button";
    const element = new Element(tag, document);
    element.id = id;
    element.disabled = true;
    const text = new RegExp('<button id="' + id + '"[^>]*>([^<]*)<').exec(html)?.[1];
    if (text) element.textContent = text;
    document.body.appendChild(element);
    return [id, element];
  }));
  elements["board-data"].textContent = data;
  document.activeElement = elements.board;
  const downloads = [];
  const urls = new Map();
  const frames = [];
  const flushFrames = () => { for (const callback of frames.splice(0)) callback(); };
  const window = new Element("window", document);
  let filePickerRequests = 0;
  elements.file.click = () => { filePickerRequests++; };
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
    container: elements.board,
    tool: "draw",
    selection: new Set(),
    get camera() { return camera; },
    setCamera(value) { camera = structuredClone(value); },
    setSelection(ids) { this.selection = new Set(ids); },
    fitContent({ margin = 0.08, maxZoom = 1 } = {}) {
      const inset = Math.min(viewport.w, viewport.h) * margin;
      const z = Math.max(0.05, Math.min(8, maxZoom, (viewport.w - 2 * inset) / bounds.w, (viewport.h - 2 * inset) / bounds.h));
      camera = { z, x: viewport.w / 2 / z - (bounds.x + bounds.w / 2), y: viewport.h / 2 / z - (bounds.y + bounds.h / 2) };
    },
    setTool(tool) { this.tool = tool; if (tool !== "select") this.selection.clear(); },
    exportImage: async options => {
      imageOptions.push(options);
      return exportImage ? exportImage(store) : new Blob([plainPng], { type: "image/png" });
    }
  };
  document.createElement = tag => {
    const element = new Element(tag, document);
    if (tag === "a") element.click = () => downloads.push({ filename: element.download, blob: urls.get(element.href) });
    return element;
  };
  document.createElementNS = (_, tag) => document.createElement(tag);
  if (fullscreenMode !== "unsupported") elements.board.requestFullscreen = async () => {
    if (fullscreenMode === "denied") throw new Error("Fullscreen denied");
    document.fullscreenElement = elements.board;
    await document.emit("fullscreenchange");
  };
  document.exitFullscreen = async () => {
    document.fullscreenElement = null;
    await document.emit("fullscreenchange");
  };
  const uiRoot = document.createElement("div");
  uiRoot.className = "qd-ui";
  elements.board.appendChild(uiRoot);
  const dock = document.createElement("div");
  dock.className = "qd-dock";
  uiRoot.appendChild(dock);
  let menuButton;
  for (const name of ["select", "draw", "styles", "more", "menu"]) {
    const button = document.createElement("button");
    button.dataset.name = name;
    button.className = "qd-tool";
    dock.appendChild(button);
    if (name === "menu") menuButton = button;
  }
  menuButton.addEventListener("click", () => {
    const existing = uiRoot.querySelector(".qd-menu-pop");
    if (existing) { existing.remove(); return; }
    const menu = document.createElement("div");
    menu.className = "qd-menu-pop";
    for (const text of ["Export as PNG", "Export — transparent", "Copy as image", "Zoom to fit", "Clear board", "Grid", "Theme"]) {
      const row = document.createElement("button");
      row.className = "qd-menu-item";
      const label = document.createElement("span");
      label.className = "qd-mi-label";
      label.textContent = text;
      row.appendChild(label);
      menu.appendChild(row);
    }
    uiRoot.appendChild(menu);
  });
  const URL = {
    createObjectURL: blob => { const key = "blob:" + urls.size; urls.set(key, blob); return key; },
    revokeObjectURL: key => urls.delete(key)
  };
  const sdk = { createQuickdraw: options => {
    editor.styles = { font: "draw", size: "m", ...options.styles };
    return { editor, ui: { setHidden: value => uiRoot.classList.toggle("qd-hidden", value) } };
  } };
  const moduleSource = /<script type="module">([\s\S]*?)<\/script>/.exec(html)[1];
  assert.doesNotMatch(moduleSource, /from "\.\/(png|toolbar)\.mjs"/);
  assert.doesNotMatch(html, /<header\b|<h1\b/);
  const source = moduleSource.replace(/await import\("https:\/\/cdn\.jsdelivr\.net\/gh\/quickdrawjs\/quickdraw@[a-f0-9]{40}\/packages\/core\/src\/index\.js"\)/, "sdk");
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction("document", "window", "URL", "sdk", "setTimeout", "clearTimeout", "requestAnimationFrame", source)(document, window, URL, sdk, () => {}, () => {}, callback => frames.push(callback));
  assert.equal(elements["export-png"].disabled, false, elements.status.textContent);
  return {
    elements, downloads, imageOptions, window, document, editor, uiRoot, dock, menuButton, flushFrames,
    filePickerRequests: () => filePickerRequests,
    current: () => structuredClone(current),
    camera: () => structuredClone(camera),
    edit: value => { current = structuredClone(value); userListener(); },
    openMenu: () => menuButton.click(),
    click: async id => {
      if (!uiRoot.querySelector(".qd-menu-pop")) await menuButton.click();
      await elements[id].click();
      flushFrames();
    },
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

test("initial tool is select with or without embedded boards", async () => {
  for (const boardNames of [["First", "Second"], []]) {
    const app = await viewer({ boardNames });
    assert.equal(app.editor.tool, "select");
  }
});

test("switching boards in both directions preserves the active non-select tool and clears selection", async () => {
  const app = await viewer();
  const changed = snapshot("Changed first board");
  app.edit(changed);
  app.editor.setTool("draw");
  app.editor.setSelection(Object.keys(changed.document.store));
  await app.select(1);
  assert.equal(app.editor.tool, "draw");
  assert.deepEqual(app.current(), snapshot("Second"));
  assert.equal(app.editor.selection.size, 0);
  assert.equal(app.elements.boards.value, "1");
  app.editor.setTool("arrow");
  app.editor.setSelection(Object.keys(app.current().document.store));
  await app.select(0);
  assert.equal(app.editor.tool, "arrow");
  assert.deepEqual(app.current(), changed);
  assert.equal(app.editor.selection.size, 0);
  assert.equal(app.elements.boards.value, "0");
});

test("opening JSON preserves the tool while clearing selection even for reused record IDs", async () => {
  for (const tool of ["text", "select"]) {
    const app = await viewer();
    const reopened = app.current();
    Object.values(reopened.document.store)[0].props.text = "Reopened JSON";
    app.editor.setTool(tool);
    app.editor.setSelection(Object.keys(reopened.document.store));
    await app.upload("reopened.json", new TextEncoder().encode(JSON.stringify(reopened)), "application/json");
    assert.equal(app.editor.tool, tool);
    assert.deepEqual(app.current(), reopened);
    assert.equal(app.editor.selection.size, 0);
    assert.equal(app.elements.boards.value, "2");
    assert.equal(app.elements.status.hidden, true);
    assert.equal(app.elements.status.textContent, "");
    assert.equal(app.camera().z, 0.545);
  }
});

test("successful loads and board switches are silent while errors and download feedback remain visible", async () => {
  const app = await viewer();
  const silent = () => {
    assert.equal(app.elements.status.hidden, true);
    assert.equal(app.elements.status.textContent, "");
  };
  silent();
  await app.click("save");
  assert.equal(app.elements.status.hidden, false);
  assert.match(app.elements.status.textContent, /JSON 下載/);
  await app.select(1);
  silent();
  await app.upload("broken.png", new Uint8Array([1, 2, 3]));
  assert.equal(app.elements.status.hidden, false);
  assert.match(app.elements.status.textContent, /載入失敗/);
  await app.select(0);
  silent();
  await app.upload("restored.png", embedSnapshot(plainPng, snapshot("Restored")));
  silent();
  await app.click("export-png");
  assert.equal(app.elements.status.hidden, false);
  assert.match(app.elements.status.textContent, /可編輯 PNG 下載/);
});

test("default text font matches generated records without changing font sizes or imported text", async () => {
  const app = await viewer();
  const generated = Object.values(app.current().document.store).find(record => record.type === "text");
  assert.equal(app.editor.styles.font, generated.props.font);
  assert.equal(app.editor.styles.font, "sans");
  assert.equal(app.editor.styles.size, "m");
  assert.equal(generated.props.size, "s");
  await app.select(1);
  assert.equal(app.editor.styles.font, "sans");
  const authored = snapshot("Handwritten text");
  for (const record of Object.values(authored.document.store)) record.props.font = "draw";
  await app.upload("existing.png", embedSnapshot(plainPng, authored));
  assert.deepEqual(app.current(), authored);
  assert.equal(app.editor.styles.font, "sans");
});

test("native menu owns the viewer actions and the selector sits immediately left of its button", async () => {
  const app = await viewer();
  assert.equal(app.elements.boards.parentNode, app.dock);
  assert.equal(app.elements.boards.nextElementSibling, app.menuButton);
  await app.openMenu();
  const menu = app.uiRoot.querySelector(".qd-menu-pop");
  for (const id of ["read", "fit", "save", "export-png", "fullscreen"]) assert.equal(app.elements[id].parentNode, menu);
  assert.equal(menu.querySelectorAll(".qd-mi-label").filter(element => element.textContent === "匯出可編輯 PNG").length, 1);
  await app.click("read");
  assert.equal(app.filePickerRequests(), 1);
  assert.equal(app.uiRoot.querySelector(".qd-menu-pop"), null);
  await app.openMenu();
  assert.equal(app.elements.read.parentNode, app.uiRoot.querySelector(".qd-menu-pop"));
});

test("native fullscreen hides all chrome and browser exit restores the previous camera, tool and selection", async () => {
  const app = await viewer();
  const previous = { x: 70, y: 80, z: 0.7 };
  app.editor.setCamera(previous);
  app.editor.setSelection(["shape:selected"]);
  const before = app.current();
  await app.click("fullscreen");
  assert.equal(app.document.fullscreenElement, app.elements.board);
  assert.equal(app.document.body.classList.contains("canvas-only"), true);
  assert.equal(app.uiRoot.classList.contains("qd-hidden"), true);
  assert.equal(app.uiRoot.querySelector(".qd-menu-pop"), null);
  assert.equal(app.elements.fullscreen.getAttribute("aria-pressed"), "true");
  assert.equal(app.editor.tool, "hand");
  assert.equal(app.editor.selection.size, 0);
  assert.deepEqual(app.current(), before);
  app.document.fullscreenElement = null;
  await app.document.emit("fullscreenchange");
  app.flushFrames();
  assert.equal(app.document.body.classList.contains("canvas-only"), false);
  assert.equal(app.uiRoot.classList.contains("qd-hidden"), false);
  assert.equal(app.elements.fullscreen.getAttribute("aria-pressed"), "false");
  assert.deepEqual(app.camera(), previous);
  assert.equal(app.editor.tool, "select");
  assert.deepEqual([...app.editor.selection], ["shape:selected"]);
  assert.equal(app.document.activeElement, app.menuButton);
  assert.deepEqual(app.current(), before);
});

test("missing or denied Fullscreen API still gives canvas-only mode with Escape exit", async () => {
  for (const fullscreenMode of ["unsupported", "denied"]) {
    const app = await viewer({ fullscreenMode });
    await app.click("fullscreen");
    assert.equal(app.document.fullscreenElement, null);
    assert.equal(app.document.body.classList.contains("canvas-only"), true);
    assert.equal(app.uiRoot.classList.contains("qd-hidden"), true);
    const event = { key: "Escape" };
    await app.window.emit("keydown", event);
    app.flushFrames();
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.immediatePropagationStopped, true);
    assert.equal(app.document.body.classList.contains("canvas-only"), false);
    assert.equal(app.uiRoot.classList.contains("qd-hidden"), false);
  }
});

test("double-click exits canvas-only mode without reaching the SDK text-editing handler", async () => {
  const app = await viewer({ fullscreenMode: "unsupported" });
  let edits = 0;
  app.elements.board.addEventListener("dblclick", () => { edits++; });
  await app.click("fullscreen");
  const event = {};
  await app.elements.board.emit("dblclick", event);
  app.flushFrames();
  assert.equal(edits, 0);
  assert.equal(event.defaultPrevented, true);
  assert.equal(app.document.body.classList.contains("canvas-only"), false);
  await app.elements.board.emit("dblclick");
  assert.equal(edits, 1);
});

test("Escape keeps the browser's native exit behavior and leaves full screen cleanly", async () => {
  const app = await viewer();
  await app.click("fullscreen");
  const event = { key: "Escape" };
  await app.window.emit("keydown", event);
  app.flushFrames();
  assert.notEqual(event.defaultPrevented, true);
  assert.equal(app.document.fullscreenElement, null);
  assert.equal(app.uiRoot.classList.contains("qd-hidden"), false);
});

test("a delayed fullscreen request cannot reopen canvas-only mode after Escape", async () => {
  const app = await viewer();
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  app.elements.board.requestFullscreen = async () => {
    await pending;
    app.document.fullscreenElement = app.elements.board;
    await app.document.emit("fullscreenchange");
  };
  await app.openMenu();
  const operation = app.elements.fullscreen.click();
  assert.equal(app.document.body.classList.contains("canvas-only"), true);
  await app.window.emit("keydown", { key: "Escape" });
  release();
  await operation;
  app.flushFrames();
  assert.equal(app.document.fullscreenElement, null);
  assert.equal(app.document.body.classList.contains("canvas-only"), false);
  assert.equal(app.uiRoot.classList.contains("qd-hidden"), false);
  assert.equal(app.elements.fullscreen.disabled, false);
});

test("canvas-only mode blocks editing shortcuts while retaining zoom and browser shortcut defaults", async () => {
  const app = await viewer();
  const before = app.current();
  app.window.addEventListener("keydown", event => {
    if (event.key === "t") app.editor.setTool("text");
    if (event.ctrlKey && event.key === "a") app.editor.setSelection(Object.keys(before.document.store));
    if (event.ctrlKey && event.key === "+") app.editor.setCamera({ ...app.camera(), z: app.camera().z * 1.25 });
  });
  await app.click("fullscreen");
  for (const options of [{ key: "t" }, { key: "a", ctrlKey: true }, { key: "v", ctrlKey: true }, { key: "Delete" }]) {
    const event = { ...options, target: app.elements.board };
    await app.window.emit("keydown", event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.immediatePropagationStopped, true);
  }
  assert.equal(app.editor.tool, "hand");
  assert.equal(app.editor.selection.size, 0);
  assert.deepEqual(app.current(), before);
  const zoom = app.camera().z;
  await app.window.emit("keydown", { key: "+", ctrlKey: true, target: app.elements.board });
  assert.equal(app.camera().z, zoom * 1.25);
  const reload = { key: "r", ctrlKey: true, target: app.elements.board };
  await app.window.emit("keydown", reload);
  assert.notEqual(reload.defaultPrevented, true);
});

test("canvas-only fit shortcuts keep the hand tool even when Shift+1 produces a literal digit", async () => {
  const app = await viewer();
  app.window.addEventListener("keydown", event => {
    if (event.key === "1") app.editor.setTool("select");
  });
  await app.click("fullscreen");
  for (const key of ["1", "!"]) {
    app.editor.setCamera({ x: 100, y: 100, z: 2 });
    const event = { key, shiftKey: true, target: app.elements.board };
    await app.window.emit("keydown", event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.immediatePropagationStopped, true);
    assert.equal(app.editor.tool, "hand");
    assert.equal(app.editor.selection.size, 0);
    assert.equal(app.camera().z, 0.545);
  }
});

test("canvas-only mode prevents paste and file-drop editing without blocking them after exit", async () => {
  const app = await viewer();
  let edits = 0;
  for (const type of ["paste", "drop"]) app.elements.board.addEventListener(type, () => { edits++; });
  await app.click("fullscreen");
  for (const type of ["paste", "drop"]) {
    const event = {};
    await app.elements.board.emit(type, event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.immediatePropagationStopped, true);
  }
  assert.equal(edits, 0);
  await app.window.emit("keydown", { key: "Escape" });
  app.flushFrames();
  for (const type of ["paste", "drop"]) await app.elements.board.emit(type);
  assert.equal(edits, 2);
});

test("the canvas save shortcut exports editable PNG and leaves selector shortcuts alone", async () => {
  const app = await viewer();
  app.edit(snapshot("Shortcut edit"));
  await app.window.emit("keydown", { key: "s", ctrlKey: true, target: app.elements.boards });
  assert.equal(app.downloads.length, 0);
  const event = { key: "s", ctrlKey: true, target: app.elements.board };
  await app.window.emit("keydown", event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.immediatePropagationStopped, true);
  assert.deepEqual((await decodedDownload(app)).snapshot, snapshot("Shortcut edit"));
});

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
  app.editor.setTool("arrow");
  await app.upload("RESTORED.PNG", bytes);
  assert.equal(app.editor.tool, "arrow");
  assert.deepEqual(app.current(), edited);
  app.edit(snapshot("Second edit"));
  await app.click("export-png");
  assert.deepEqual(await decodedDownload(app), { filename: "RESTORED.png", snapshot: snapshot("Second edit") });
});

test("ordinary PNG, corrupt bytes and invalid snapshots leave the current board intact", async () => {
  const app = await viewer();
  const before = app.current();
  app.editor.setTool("line");
  app.editor.setSelection(Object.keys(before.document.store));
  const selection = [...app.editor.selection];
  const camera = app.camera();
  const unchanged = () => {
    assert.deepEqual(app.current(), before);
    assert.equal(app.editor.tool, "line");
    assert.deepEqual([...app.editor.selection], selection);
    assert.deepEqual(app.camera(), camera);
    assert.equal(app.elements.boards.value, "0");
    assert.equal(app.elements.boards.children.length, 2);
  };
  await app.upload("ordinary.png", plainPng);
  assert.match(app.elements.status.textContent, /沒有 Quickdraw 編輯資料/);
  unchanged();
  await app.upload("broken.png", new Uint8Array([1, 2, 3]));
  assert.match(app.elements.status.textContent, /載入失敗/);
  unchanged();
  await app.upload("broken.json", new TextEncoder().encode("{"), "application/json");
  assert.match(app.elements.status.textContent, /載入失敗/);
  unchanged();
  await app.upload("bad.json", new TextEncoder().encode('{"nodes":[]}'), "application/json");
  assert.match(app.elements.status.textContent, /缺少 document.store/);
  unchanged();
  await app.select(99);
  assert.match(app.elements.status.textContent, /載入失敗/);
  unchanged();
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
  await app.openMenu();
  const operation = app.elements["export-png"].click();
  assert.equal(app.elements.board.inert, true);
  for (const id of ["boards", "file", "read", "fit", "save", "export-png", "fullscreen"]) assert.equal(app.elements[id].disabled, true);
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

test("presentation buttons clamp at ends and preserve edits when returning", async () => {
  const app = await viewer();
  assert.equal(app.elements.previous.disabled, true);
  assert.equal(app.elements.next.disabled, false);
  assert.equal(app.elements['page-count'].textContent, '1 / 2');
  app.edit(snapshot('Edited page'));
  await app.elements.next.click();
  assert.deepEqual(app.current(), snapshot('Second'));
  assert.equal(app.elements.next.disabled, true);
  assert.equal(app.elements['page-count'].textContent, '2 / 2');
  await app.elements.next.click();
  assert.deepEqual(app.current(), snapshot('Second'));
  await app.elements.previous.click();
  assert.deepEqual(app.current(), snapshot('Edited page'));
});

test("keyboard paging respects editor keys, typing and modifiers", async () => {
  const app = await viewer({boardNames: ['First', 'Second', 'Third']});
  await app.window.emit('keydown', {key: 'ArrowRight', target: app.elements.board});
  assert.equal(app.elements.boards.value, '0');
  for (const event of [
    {key: 'PageDown', target: {isContentEditable: true}},
    {key: 'PageDown', target: {closest: () => ({})}},
    {key: 'PageDown', ctrlKey: true},
    {key: 'PageDown', repeat: true}
  ]) await app.window.emit('keydown', event);
  assert.equal(app.elements.boards.value, '0');
  await app.window.emit('keydown', {key: 'PageDown', target: app.elements.board});
  assert.equal(app.elements.boards.value, '1');
  await app.click('fullscreen');
  await app.window.emit('keydown', {key: 'End', target: app.elements.board});
  assert.equal(app.elements.boards.value, '2');
  await app.window.emit('keydown', {key: 'ArrowLeft', target: app.elements.board});
  assert.equal(app.elements.boards.value, '1');
  await app.window.emit('keydown', {key: 'Home', target: app.elements.board});
  assert.equal(app.elements.boards.value, '0');
  await app.window.emit('keydown', {key: 'Escape', target: app.elements.board});
  app.flushFrames();
  assert.equal(app.editor.tool, 'select');
});
