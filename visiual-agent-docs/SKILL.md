---
name: visiual-agent-docs
description: Render explicitly selected Spec, plan, and/or todo Markdown files as a concise offline HTML review with source anchors, explicit Plan-to-Task mapping, plain-language explanations, optional diagrams, synthetic interaction examples, notes, and feedback export.
---

# visiual-agent-docs

Use this skill to turn explicitly selected Markdown documents into a self-contained, offline review page. The page helps a reader understand each item, verify it against the source, and leave feedback. It is a read-only review surface: it does not approve work, execute tasks, edit Markdown, or infer requirements.

## Workflow

1. **Use only selected sources.** Read each Markdown file the user explicitly names, including its complete contents. Do not scan a repository or discover additional files. Record one common `sourceRoot` and a relative POSIX `path` for each selected document.
2. **Build a small manifest.** Follow the [manifest contract](references/data-contract.md). Preserve source item IDs when they are reliable; omit `itemId` when no reliable ID exists so the renderer can derive one from the title and source anchor. For every item, provide a short `summary`, a concrete `example` when useful, `glossary` entries for the source terms a first-time reader cannot decode, necessary `details`, and `source.lines`/`source.anchor`. Preserve source order or provide an explicit `order` for plan and todo items.
3. **Keep evidence separate from explanation.** Summaries, examples, glossary entries, and details explain the source; `acceptance`, `risks`, `questions`, `status`, boundaries, and relations retain only what the source states. Mark synthetic examples as synthetic. Do not turn an analogy into a requirement, boundary, or relation. Unknown information stays unknown.
4. **Handle Plan and Todo explicitly.** When both are supplied, use only source-declared `type: "plan-task"` relations from a Plan item to a Todo item. Endpoints must use complete `docId` and `itemId` values, and the relation must retain its source anchor. Never match by title, label, step number, or text similarity. Keep invalid or unmapped relations visible for review without drawing a false link. Plan-only and Todo-only documents remain usable on their own.
5. **Add diagrams only when they answer a reader's question better than text.** If choosing a diagram type, arranging nodes, or checking connectors, conditionally read [diagram guidelines](references/diagram-guidelines.md). Do not generate a diagram, chart, toy, or plan merely because a field is available.
6. **Keep toys synthetic and isolated.** A toy is optional and must use only its own synthetic data. The renderer places it in a sandboxed iframe with restrictive policy; it must not read source files or page state, write notes or storage, use the network, or navigate the parent page.

### Authoring language and tone

Write generated summaries, examples, glossary entries, details, diagram labels, and toy copy in the language requested by the user. If no language is requested, follow the source language. Never impose a fixed language on source-derived content, and keep source excerpts verbatim. The shared template supplies fixed English UI labels; source-derived content retains its source language, and localization remains outside this skill's contract.

Explain every item as you would to a capable colleague who has never opened this repository. The reader should understand the item before meeting its vocabulary, so lead with the plain claim and let the jargon follow.

- `summary`: one sentence, no undefined jargon — what changes, for whom, or what the reader now understands.
- `example`: one concrete scene with a specific actor, action, and outcome. Mark an invented one as synthetic.
- `glossary`: the few source terms a first-time reader cannot decode, one plain sentence each, `term` kept verbatim from the source.
- `details`: the mechanism and why it is built this way, one idea per sentence.
- `risks`, `acceptance`, `questions`: the source's meaning in plain words; never soften a limitation or bury it inside an analogy.

Write plainly without writing down: no filler reassurance, no "simply", and no invented numbers, names, or paths that make an example look concrete. When an item resists plain phrasing or the source is dense with jargon, read [explanation style](references/explanation-style.md).

## Rendering

Resolve `<skill-dir>` as the directory containing this loaded `SKILL.md`. `render.py` resolves `assets/template.html` relative to its own location, so the skill can be used from any caller directory without an installation-path assumption. The renderer reads the selected files under `--root`, rebuilds source excerpts from the files, computes source and snapshot identifiers, and embeds the fixed template and data into one HTML file.

Choose the output in the caller's current working directory by default. Use an explicitly requested output path when one is supplied. Before rendering, check whether the target exists: overwrite only when the caller has authorized replacement; otherwise choose a new filename in the same target directory. The renderer writes the exact output path supplied and does not rename it for you.

The renderer requires Python 3 and uses only its standard library.

Generic invocation:

```sh
python3 <skill-dir>/render.py \
  ./visual-agent-docs-manifest.json \
  ./visual-agent-docs-review.html \
  --root <source-root>
```

After rendering, inspect stdout and stderr. Report the output path, source or mapping warnings, unresolved relations, and any manifest errors. Do not claim interactive browser verification unless the page was actually opened and operated.

In the Spec view, the reader can toggle **Enlarge item** to give the current item the full page width: the map hides, Previous/Next appears, and diagrams scale up with the panel. Author for that reader — keep labels short and the text fallback complete — and do not shrink content in anticipation of the narrow column.

## Preserved contracts

- The manifest is explicit: `documents` is non-empty, each `kind` is `spec`, `plan`, or `todo`, and each document path is a safe relative POSIX path below `--root`.
- `source.lines` is a 1-based inclusive pair. The renderer reads the source file and reconstructs the excerpt; it does not trust an excerpt copied into the manifest.
- `boundary` is `in`, `out`, or `unknown`; use `unknown` when the source does not state the scope. Do not invent boundaries, dependencies, or relations.
- `glossary` is explanation, not evidence: `term` stays verbatim from the source, `plain` stays one sentence, and no requirement, boundary, or acceptance criterion is introduced there.
- Notes are independent of Markdown. They are keyed by the current `snapshotId`, item stable key, and source version; a changed or mismatched source is not silently given old notes. Source `status` is read-only, and Previous/Next changes reading position only—it does not mark work complete or approved.
- HTML source text is displayed as text, not executed. Synthetic toys stay sandboxed and offline. A failed save or clipboard operation must remain visible so the page never claims a success it did not observe.
- Diagram data supports the existing small `flow` and `mapping` layouts. The current renderer lays out at most 9 nodes and 12 edges; unknown endpoints, unsupported branches, long labels, or other layouts beyond its finite geometry use the complete text fallback. Do not silently drop nodes or edges.
- Do not write back to Markdown, execute a plan or todo, send feedback, create a plan automatically, or scan beyond the files explicitly selected by the caller.

