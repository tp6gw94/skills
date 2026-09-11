# Manifest contract v1

`render.py MANIFEST OUTPUT --root SOURCE_ROOT` accepts a JSON object. `sourceRoot` is a display/logical root; every `documents[].path` must be a relative POSIX path below `--root`.

```json
{
  "title": "Document review",
  "summary": "Short summary",
  "sourceRoot": "project",
  "documents": [
    {
      "path": "docs/SPEC.md",
      "kind": "spec",
      "items": [
        {
          "itemId": "S-01",
          "title": "Declared scope",
          "boundary": "in",
          "summary": "What this item changes for the reader",
          "example": "A concrete, source-grounded situation",
          "glossary": [{"term": "merge gate", "plain": "One plain sentence: what it is and why it matters here"}],
          "details": "Only the context needed to understand it",
          "acceptance": ["A checkable condition from the source"],
          "risks": ["A stated limitation"],
          "questions": ["An unresolved question"],
          "source": {"anchor": "Declared scope", "lines": [10, 14]}
        }
      ]
    }
  ],
  "relations": [
    {
      "from": {"docId": "project:docs/SPEC.md", "itemId": "S-01"},
      "to": {"docId": "project:docs/SPEC.md", "itemId": "S-02"},
      "label": "supports",
      "source": {"docId": "project:docs/SPEC.md", "anchor": "supports", "lines": [20, 20]}
    }
  ],
  "toys": [
    {"id": "example", "title": "Small example", "description": "Synthetic data", "html": "<button>...</button>"}
  ]
}
```

## Documents and items

- `kind` is exactly `spec`, `plan`, or `todo`.
- The renderer computes each document's `docId` as `sourceRoot:path`. If the manifest supplies a different `docId`, the renderer warns and uses the computed value.
- `itemId` should come from the source. If it is omitted, the renderer derives an ID from `kind`, `source.anchor` (or title), and the starting line. A blank or duplicate ID remains readable but cannot be used for stable note or relation mapping.
- `source.lines` is a 1-based inclusive pair. The renderer reads the selected file and rebuilds the excerpt from those lines; it does not trust an excerpt supplied in the manifest. `source.anchor` is retained for locating the passage and may produce a warning if it is absent from the excerpt.
- Optional item fields are `order`, `status`, `example`, `glossary`, `pseudocode`, `diagram`, `toyId`, and `questions`. The renderer also accepts `summary`, `details`, `acceptance`, and `risks` as shown above. Lists must contain strings.
- `glossary` is an ordered array of `{term, plain}` objects; both values must be non-empty strings. It explains vocabulary and is never evidence: keep `term` exactly as the source writes it, keep each `plain` value to one sentence, and keep requirements in `acceptance` or `risks`. The renderer shows it directly under the concrete example. See [explanation style](explanation-style.md) for the writing rules.
- `boundary` accepts only `in`, `out`, or `unknown`. Use `unknown` when the source does not state the scope.

## Diagrams

A `diagram` is an item-level explanatory illustration, not evidence for a formal `relations` entry and not a substitute for source text. Keep this small shape:

```json
{
  "title": "Input to output | explanatory diagram",
  "layout": "flow",
  "nodes": [{"id": "input", "label": "Input", "description": "Selected data"}],
  "edges": [{"from": "input", "to": "process", "label": "organize"}]
}
```

`layout` may be omitted (`auto`) or set to `flow` or `mapping`. A `flow` diagram is for a simple ordered input/process/output chain. A `mapping` diagram is for two lanes of explicit Plan-to-Task correspondence; nodes may carry `lane: "plan"` or `lane: "task"`. Nodes accept only `id`, `label`, `description`, and `lane`; edges accept only `from`, `to`, and `label`.

The current renderer has finite diagram geometry: up to 9 nodes and 12 edges, known endpoints, and a simple chain for `flow` or valid Plan-to-Task lanes for `mapping`. Branches, isolated flow nodes, unknown endpoints, long text, invalid mapping lanes, or data above those limits use a complete text fallback. The fallback retains all nodes and edges, including unknown endpoints; it is not permission to discard content.

The renderer builds inline SVG through safe DOM operations. Each SVG has a `title` and `desc`, and a full text alternative lists nodes and edges. Keep explanatory diagram data, formal `relations`, source excerpts, and synthetic toy data separate. A toy is always marked synthetic and runs in an isolated iframe using only its supplied HTML.

## Plan-to-Task correspondence

Plan and Todo/Task documents use one explicit relation type: `type: "plan-task"`. `from` must resolve uniquely to an item in a `plan` document, and `to` must resolve uniquely to an item in a `todo` document. Both endpoints use complete `docId` and `itemId` values, and the relation itself must retain a source anchor.

```json
{
  "type": "plan-task",
  "from": {"docId": "project:docs/PLAN.md", "itemId": "P-01"},
  "to": {"docId": "project:docs/TODO.md", "itemId": "T-01"},
  "label": "explicit correspondence",
  "source": {"docId": "project:docs/TODO.md", "anchor": "Plan P-01", "lines": [8, 8]}
}
```

The renderer converts only a valid, unique, correctly directed, non-duplicate `plan-task` relation with a valid source anchor into `fromKey` and `toKey`. Missing type, wrong kind, duplicate relation, duplicate item ID, missing/unresolvable endpoint, or missing source anchor stays in the relation and error list but does not create a mapping. Labels, titles, step numbers, and text similarity never infer a correspondence. An unmapped Todo item remains readable, available for notes, and exportable. If no Todo document is supplied, the Plan view states that tasks were not provided.

## Snapshot and notes identity

The renderer outputs `contractVersion`, `sourceVersion` for each selected document, a combined `snapshotId`, stable item keys, and an `errors` list. Notes use `snapshotId + stableKey + sourceVersion`; Plan and Todo items with similar IDs remain separate because their stable keys include the complete document identity. Navigation changes the reading position only. Source status is display-only and no completion or approval field is generated.
