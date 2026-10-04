---
name: draw-explainer
description: Generate Quickdraw visual explainers with native JSON and a reusable whiteboard viewer. Use for diagram-led explanations, editable PNG export and reopening, and data-only validation rather than browser QA.
---

# Draw explainer

Deliver native Quickdraw snapshot JSON and the reusable viewer for editable PNG export and reopening. Design each explanation's layout from its meaning. This workflow produces an editable static whiteboard, not a narrated video or a GSAP timeline.

## 1. Choose the explanation

Extract one central question, the necessary concepts, and the relationships that answer it. Keep factual claims traceable to supplied material or checked sources. Label illustrative numbers, metaphors, and conceptual pseudocode as examples rather than implementation guarantees.

Choose a layout that fits the subject: boundaries and crossings, parallel paths, a branching decision, a hierarchy, a comparison, or a free spatial composition. Combine structures where useful. The reusable parts are shapes and viewer mechanics, not a mandatory scene template or node-count limit.

Write a compact diagram plan: concepts, relationships, reading order, short labels, caveats, and source credit. Prefer a board that supports overview plus zoom over shrinking every detail into a fixed viewport. Finish when all required concepts and relationships have a visual role.

## 2. Generate native records

Read [references/contract.md](references/contract.md) before generating records or integrating the tools. Use [scripts/board.mjs](scripts/board.mjs) for cards, text, arrows, lines, explicit text wrapping, and native snapshot output. Import it from its absolute skill path in a small topic-specific generation script; keep topic scripts in the output project rather than changing packaged utilities.

Native JSON uses `document.store`, keyed by each record's own ID. It is not a `{ nodes, edges }` graph awaiting conversion. Keep titles, provenance, and packaging metadata outside the native snapshot or represent source credit as visible board text.

Apply these authoring rules:

- Use unique, stable IDs and finite coordinates, dimensions, rotation, and z-order. Give region outlines a lower z-order than their contents.
- Write short labels with explicit line breaks. Quickdraw's whitespace-based wrapping does not reliably break continuous CJK text; the helper inserts newlines using estimates.
- Wrap before sizing a card. If its estimated text height exceeds the budget, shorten the text, enlarge the card, or split the concept. Move adjacent shapes and connector routes when dimensions change; regenerate and revalidate after the final edit.
- Keep arrows outside unrelated cards and route branches through open space. Arrows store geometric deltas, not semantic node bindings; moving a node does not automatically update its connectors.
- Use the pinned SDK's named colors, sizes, fonts, and shape properties. A broad `props` object in upstream types is not proof that arbitrary fields or values render correctly.

For multiple independent topics, reuse the same utilities and assign exclusive output files when parallel work is authorized. Small diagrams can be generated in one pass. JSON is complete when every planned concept, relation, caveat, and source credit is represented.

## 3. Validate data, not screenshots

Run the packaged validator after generation and after any content or geometry fix:

```sh
node <skill-dir>/scripts/validate.mjs <output/diagram.json> --report <output/validation-report.json>
```

The default gate is local data validation: native envelope, record identity, supported per-type properties, finite numbers, valid dimensions, nonzero connectors, and estimated card text height. The packaged contract covers unrotated `geo`, `text`, `arrow`, and `line` records. Extend the validator and viewer deliberately before using other types or rotation.

An optional `--core-dir <quickdraw/packages/core>` performs native Store load/export round-tripping with a locally available SDK. Record which SDK was actually used. Round-trip success confirms record preservation, not rendering or schema correctness; it supplements property validation.

No browser launch, screenshots, font measurement, or repeated visual tuning is required by default. Visual QA is opt-in when the user requests it or reports a display problem. Structural success does not certify readable fonts, non-overlap, connector routing, or correct explanations.

Finish when every JSON passes the declared data contract and known failures are fixed. Keep unverified visual behavior explicit.

## 4. Package the fixed viewer

Use [assets/viewer-template.html](assets/viewer-template.html) through the packager instead of regenerating UI for each explanation:

```sh
node <skill-dir>/scripts/package.mjs <output/diagram.json> [<output/another.json>] --out <delivery-directory>
```

The packager validates each snapshot, copies native JSON, embeds the same data into `index.html`, and writes a data-validation report. The output HTML uses the native Quickdraw dock and menu for board switching, JSON/editable-PNG loading, fitting, editing, JSON download, editable PNG export, and canvas-only fullscreen. Its controls are a shell, not a prescribed diagram layout.

Embedding avoids `file://` JSON-fetch restrictions and stale separate sample files. Refresh the package after JSON changes. If a board has been edited in the viewer, preserve the downloaded JSON or editable PNG as the new source of truth; rerunning an old generation script would overwrite those edits.

The template uses a pinned remote Quickdraw SDK and stylesheet. State the network requirement. For offline delivery, use locally available SDK modules and CSS with matching provenance and a supported serving setup. Keep the exported JSON usable independently of the viewer.

Use the native `⋮` menu's editable PNG export. Its transparent/selection exports and clipboard copying remain ordinary raster images without editable metadata. Reopen that PNG through the viewer's file input to restore native records. The metadata contract and interoperability limits are in [references/contract.md](references/contract.md#editable-png). All PNG processing happens locally in the browser; no save backend is required. Downloads create files rather than silently overwriting the original. Edits are not automatically saved. Switching boards retains them only in the current page's memory; download edited boards before closing the page. Keep original exports because image optimizers and messaging platforms can strip metadata.

Only assume SDK snapshot loading, not a JSON-import button in the hosted Quickdraw app. Deliver the explicit file-loading viewer or the SDK integration described in the contract reference.

## 5. Deliver accurately

Provide JSON paths, the viewer path when packaged, a brief explanation of each diagram, and the validation scope. Explain the `⋮` menu's editable PNG export/reopen controls and the board selector immediately left of that menu. Fullscreen hides chrome; Esc or double-click exits. Browser denial falls back to viewport-only canvas mode. Report PNG files only when actually exported; packaging JSON does not render PNG images. State: data and basic geometry validated; visual rendering not verified, unless separate visual QA was actually performed. Arbitrary files opened in a viewer are not automatically certified by a prior package report.

Report measured generation or validation timings only when captured. Keep topic-generation time separate from first-time utility setup, packaging, and total wall time; parallel task durations are not added together.

When modifying packaged utilities, run `node --test <skill-dir>/tests/*.test.mjs` and validate representative snapshots. These are utility regression checks, not per-diagram browser QA.
