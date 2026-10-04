# Quickdraw data and tool contract

## Version boundary

The viewer and data rules target Quickdraw revision `dd653639aec1212c9ec5704e2eafd2a75560a0af`. Its core package metadata reports `0.2.0`; a published package with the same version is not automatically evidence of identical source. Keep the viewer, validator assumptions, and any round-trip SDK provenance aligned when changing versions.

Upstream references:

- [Snapshot and public record types](https://github.com/quickdrawjs/quickdraw/blob/dd653639aec1212c9ec5704e2eafd2a75560a0af/packages/core/types/index.d.ts)
- [Actual rendering and text layout properties](https://github.com/quickdrawjs/quickdraw/blob/dd653639aec1212c9ec5704e2eafd2a75560a0af/packages/core/src/shapes.js)
- [Named styles and font sizes](https://github.com/quickdrawjs/quickdraw/blob/dd653639aec1212c9ec5704e2eafd2a75560a0af/packages/core/src/palette.js)
- [Snapshot loading and export](https://github.com/quickdrawjs/quickdraw/blob/dd653639aec1212c9ec5704e2eafd2a75560a0af/packages/core/src/store.js)

`Store.loadSnapshot()` is permissive: accepting a record does not establish that its props are valid for rendering. The native round-trip is a preservation test, separate from the stricter subset validator.

## Native snapshot

```json
{
  "document": {
    "store": {
      "shape:example:input": {
        "id": "shape:example:input",
        "typeName": "shape",
        "type": "geo",
        "x": 40,
        "y": 160,
        "rot": 0,
        "z": 20,
        "props": {
          "geo": "rectangle",
          "w": 300,
          "h": 150,
          "label": "Input\nEvidence",
          "labelSize": "s",
          "color": "blue",
          "size": "s",
          "dash": "solid",
          "fill": "semi",
          "font": "sans"
        }
      }
    }
  }
}
```

The native envelope contains document records, not topic metadata or a semantic graph. Store keys must match record IDs. A shape requires `id`, `typeName`, `type`, `x`, `y`, `rot`, `z`, and type-specific `props`. The packaged subset additionally requires a `shape:` ID prefix and supplies explicit styles rather than depending on renderer defaults. These are this workflow's stricter authoring conventions, not a complete upstream schema.

## Builder

Import `createBoard` from `scripts/board.mjs` at the resolved skill path. It exposes:

- `box(id, x, y, width, height, label, options?)`: a `geo` record. Options include `geo`, `labelSize`, styles, and `z`. An empty label is valid for a region outline.
- `text(id, x, y, width, content, options?)`: explicit-width text with inserted newlines. Options include `size`, `color`, and `z`.
- `arrow(id, x1, y1, x2, y2, options?)` and `line(...)`: origin plus `dx`, `dy`, and optional `bend`. Options include styles and `z`.
- `snapshot()`: the native object.
- `save(path)`: write formatted native JSON and return the record count.

IDs are namespaced from the board slug and local ID; reusing a local ID in one board is rejected. The helper uses `sans` text and guards estimated card height. It does not choose topic structure, route edges automatically, or measure actual browser fonts. See its exported `FONT_SIZES` and wrapping implementation for the current estimates.

Example generation script:

```js
import { createBoard } from "/absolute/skill/path/scripts/board.mjs";
import { fileURLToPath } from "node:url";

const board = createBoard("example");
board.box("input", 40, 160, 300, 150, "Input\nEvidence", { color: "blue" });
board.box("output", 460, 160, 300, 150, "Output\nUnderstanding", { color: "green" });
board.arrow("relation", 348, 235, 452, 235, { color: "blue" });
board.save(fileURLToPath(new URL("./example.json", import.meta.url)));
```

Use `fileURLToPath` for URL-derived filesystem paths; raw URL `.pathname` can leave encoded characters or platform-specific path problems.

## Geometry and text

- `geo`: positive `w` and `h`, supported `geo`, explicit `labelSize`, and string `label`.
- `text`: nonempty `text`, positive `w` and `scale`, `autosize: false`, and supported alignment. Newline-separated content still uses browser font metrics when rendered.
- `arrow` / `line`: finite `dx`, `dy`, `bend`; `dx` and `dy` cannot both be zero. Their destination is `(x + dx, y + dy)`, not a referenced node ID.
- Layer regions behind nodes and text. Routing is authored geometry; there is no automatic graph layout or node binding in these records.

Quickdraw wraps text at whitespace, so a continuous Chinese phrase may remain one oversized word. Insert newlines before rendering. Wrapping estimates can split long English tokens too; author meaningful breaks for formulas, identifiers, and URLs when readability matters. After adding a caption, recalculate card height rather than reusing the previous dimensions.

## Validation and packaging

Run `validate.mjs` on explicit JSON paths. `--report` writes evidence only after all inputs pass. Optional `--core-dir` must point to a core package directory containing `src/store.js`; record its actual provenance when using it.

The validator covers the four supported unrotated shape types, their supplied fields, finite basic geometry, and estimated card text height. It does not inspect all Quickdraw types, measure fonts, detect overlapping cards, verify routes, or establish technical truth.

`package.mjs` accepts the same explicit input paths and `--out <directory>`. It embeds validated snapshots into the packaged viewer, copies the JSON, and writes a report. Updating JSON requires repackaging to update embedded data. The viewer does not upload snapshots or automatically persist edits. Its JSON download and editable PNG export preserve the current SDK snapshot; packaging does not render PNG files. The packager inlines the PNG codec and toolbar adapter so the delivered HTML has no local module dependency.

The generic viewer is an HTML shell with a board-data placeholder, not a ready-made explanation. Packaged HTML can open directly when its pinned remote SDK and stylesheet are reachable. If local-file restrictions interfere, serve the delivery directory with a simple static server. A missing CDN dependency does not invalidate the standalone JSON.

## Editable PNG

[assets/png.mjs](../assets/png.mjs) implements the `quickdraw.nvim` version 1 artifact contract. It exports synchronous `embedSnapshot(pngBytes, snapshot)` and `extractSnapshot(pngBytes)` functions for `Uint8Array` PNG bytes. Embedding returns a new byte array. Extraction returns the stored object, or `null` for a valid ordinary PNG; corrupt or unsupported metadata throws an error carrying a stable `code`.

The PNG contains one uncompressed `iTXt` chunk with keyword `quickdraw.nvim`, empty language and translated-keyword fields, and UTF-8 JSON:

```json
{
  "schema": "quickdraw.nvim",
  "version": 1,
  "snapshot": { "document": { "store": {} } }
}
```

The codec validates PNG signature, chunk structure and CRCs, the initial IHDR, final IEND, metadata layout, schema, and version. It inserts metadata before IEND and preserves other chunk bytes, including image data. Embedding replaces all previous matching metadata; extraction rejects duplicates. Snapshot metadata preserves records, not undo history, camera, or theme settings. Metadata compatibility alone does not establish SDK rendering compatibility.

Use the native `⋮` menu's editable PNG export, which replaces the SDK's primary PNG item. Transparent exports, selection exports, and clipboard copying remain ordinary raster images without a snapshot. `Ctrl/Cmd+S` with focus on the canvas exports editable PNG; selector keystrokes stay with the native dropdown. A normal PNG or one stripped of metadata cannot restore native shapes; the viewer rejects it without replacing the current board. Keep original exports when publishing images through services that may optimize or transcode them.

The viewer reads selected files with the browser File API and downloads generated PNG blobs. It needs no application backend and does not overwrite the original file. CDN loading remains a separate network dependency; a static server is only a fallback for local-file restrictions. Export covers the whole board, not just selected records. An empty board cannot produce a rendered PNG; JSON remains available. Export waits for fonts and temporarily blocks editor input to keep image and snapshot consistent.

The viewer's reopening gate accepts the SDK's native shape types and image asset records with embedded `data:image/` sources so its own toolbar edits can be restored. This is basic identity/numeric/record validation, not the stricter four-type authoring validator, nor rendering certification. Repackaging an edited board with types outside the authored subset still requires deliberately extending the authoring validator.

Interoperability source: local `quickdraw.nvim` revision `7eec917b5183dcb89f462811b3b82475107d5a52`, `lua/quickdraw/png.lua` and `SPEC-artifact-format.md`. Bidirectional codec checks against that Lua implementation establish artifact compatibility only; they do not establish browser rendering. Utility tests exercise packaged controls with simulated DOM/SDK boundaries, not a browser. To repeat the optional Lua check, set `QUICKDRAW_NVIM_DIR` to the local plugin checkout when running the Node test suite; `NVIM_BIN` optionally selects the Neovim executable. Without that directory, the interoperability test is explicitly skipped.

## Viewer chrome

New viewer text defaults to `sans`, matching generated records. This configures the editor's creation style rather than rewriting snapshots; existing fonts, author-selected styles, and individual font sizes stay intact.

The viewer has no visible title or header. [assets/toolbar.mjs](../assets/toolbar.mjs) inserts the board selector directly before the native dock's menu button and moves existing viewer action elements into that menu. It augments the pinned SDK's DOM rather than modifying the plugin checkout or copying the SDK's UI implementation.

The adapter depends on `.qd-ui`, `.qd-dock`, `button[data-name="menu"]`, `.qd-menu-pop`, and the native primary export and fit labels. Decoration runs synchronously after the SDK's menu-button listener creates each menu. Actions close it through the native button so private popover state remains synchronized; names and filenames remain text. Recheck the adapter and native menu tests when changing the SDK revision. Native transparent/selection/copy/clear/grid/theme actions remain intact. The menu is height-limited and scrollable; wheel events stay inside it rather than panning the editor. Grid options expand inline within that scroll region instead of being clipped as a sideways flyout. On narrow frames the dock can scroll horizontally while the selector and menu stay pinned to its right edge; this layout has not been browser-verified.

Fullscreen targets only the board and uses `board.ui.setHidden(true)` to hide the dock, menu, and action bar. It keeps the hand tool for panning and blocks editing/tool-selection shortcuts, paste, and drops so hidden chrome cannot reappear as text editing or selection handles. Zoom, fit, save, and exit remain available. If the Fullscreen API is absent or denied, the same canvas-only presentation stays within the browser viewport, with browser chrome still visible. Esc, native browser fullscreen exit, or double-click restores the previous camera, tool, selection, and menu-button focus without swapping records. Delayed fullscreen requests respect an intervening exit. Informational status messages are transient overlays, suppressed in canvas-only mode; errors remain until replaced.

## SDK integration

Initial loading, switching boards, reopening files, and the fit button frame the diagram's content bounds with 8% viewport-relative padding, capped at 1:1 so small diagrams are not magnified. In the pinned SDK, `fitContent().margin` is a fraction of the smaller viewport dimension, not pixels; passing `40` makes the available space negative and clamps zoom to the minimum. Keep one framing policy for all viewer entry points.

SDK loading in an existing application:

```js
board.editor.store.loadSnapshot(snapshot, "remote");
board.editor.fitContent();
```

Do not assume the hosted app has the same file-loading UI as the packaged viewer. Reports certify their input files at validation time, not arbitrary later uploads or edits.
