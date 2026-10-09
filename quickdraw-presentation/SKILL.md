---
name: quickdraw-presentation
description: Create editable Quickdraw whiteboard presentations with an ordered native JSON page sequence, previous/next navigation, and editable PNG export. Use for talks, lessons, and stories requested as Quickdraw boards.
---

# Quickdraw presentation

Produce a sequence of native **quickdrawjs/quickdraw** whiteboards and the packaged Quickdraw SDK viewer. Each page is its own `document.store` snapshot. The HTML is an editor shell around native records, not a substitute slide renderer. Read [the data contract](references/contract.md) before generating records. Use only documented capabilities of the pinned revision.

## Story and page plan

Infer the audience, purpose, language, duration, and delivery setting from the request. Choose a sequence suited to the topic: an explanation may introduce a model then work an example, while a story may follow a situation, change, and resolution. Preserve the requested page count. Avoid filling a fixed template with redundant pages.

Write a compact `storyboard.json` in the output project. For each page record its ordered filename/ID, purpose, main idea, visual form, example or evidence, takeaway, spoken transition, and sources. Keep detailed narration in this sidecar, outside the native snapshot. A page should advance one main idea with enough structure to understand it. Match density to its role: spare opening, clearly labelled flow, balanced comparison, or worked example. See [design and source provenance](references/presentation-design.md).

## Author editable boards

Import `createBoard` from this skill's `scripts/board.mjs` in a topic generator outside the skill. Use native text, geo, arrow and line records. Use one snapshot per page rather than pretending the SDK has frame/page records. IDs are stable and namespaced by page; page order comes from the explicit packager argument sequence, never directory enumeration or lexical sorting.

Use a consistent stage budget with title, primary visual, takeaway/source, and space for navigation. Start around 1200 × 680 world units, titles `xl`, body/labels `m` or `l`, source/footer `s`; adapt for the setting. Make meaning visible through relationships and hierarchy, not repeated cards. Keep text compact and split a speaking beat before reducing font size. CJK text needs explicit line breaks. Arrows use geometric deltas and must be rerouted when elements move. Elements remain individually editable in Quickdraw; no screenshot of the whole page as the deliverable.

## Validate, package, and inspect

```sh
node <skill-dir>/scripts/validate.mjs <01-page.json> <02-page.json> --report <data-report.json>
node <skill-dir>/scripts/package.mjs <01-page.json> <02-page.json> --out <new-delivery-directory>
node --test <skill-dir>/tests/*.test.mjs
```

List paths in intended presentation order. The packager copies native files, embeds them in `index.html`, and validates records. Use the template unchanged for topic work. Regenerate the package after changing snapshots. Its SDK/CSS are pinned remote dependencies; direct local-file opening needs network or cached dependencies. Do not assume the hosted Quickdraw app can import JSON.

Open the actual packaged viewer in an available user browser. Visually inspect **every page**, especially Chinese text, connectors, projection readability, overlap, clipping and navigation-safe space. Fix content and geometry, then regenerate and inspect affected pages. Data checks estimate text height and do not certify visual layout. If browser access is blocked, deliver native boards but explicitly leave visual and interaction validation unverified. Never manufacture screenshots or claim checks that did not run.

Check next/previous buttons, first/last bounds, arbitrary selector jumps and returning to an edited page. Test PageDown/PageUp in editing mode, then fullscreen Right/Left and Home/End, fit after each switch, Esc exit and text editing without key capture. Verify editable PNG export/reopening if reported as tested. New file imports append pages to the session. A fullscreen refusal falls back to viewport presentation. No network upload, account or backend is needed for editing/export.

## Handoff

Provide the ordered native JSON files plus viewer, storyboard/source sidecar, and actual screenshots or previews when available. Explain: top-right previous/next controls and page count; selector beside the native menu for page jumps; PageDown/PageUp for paging; fullscreen additionally supports Left/Right and Home/End; Esc/double-click exits. Left/Right remain editor keys outside fullscreen, and typing/select controls keep their keys. Controls remain in fullscreen at reduced opacity so touch/mouse users can navigate.

Edits stay in memory across page switches but are not saved automatically. Download each edited page as JSON or editable PNG from `⋮` before closing. Current-page export contains only that board, not the deck or order. Retain storyboard and all ordered files for a complete presentation. Repackaging older generated JSON replaces browser edits. Editable PNG uses `quickdraw.nvim` metadata; normal/transparent/clipboard images do not restore elements.

Separate data validation, simulated utility tests and observed browser results in the report. Name browser coverage and remaining checks. Save user deliverables to Library when available. Do not publish, install globally, push or open a PR unless the user authorizes it.
