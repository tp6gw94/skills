# Diagram guidelines

Use a diagram only when it answers a specific reader question more directly than a short paragraph. State that purpose before choosing a layout.

## Choose the smallest layout

- Use `flow` for a simple, ordered input → process → output chain. Keep the nodes in sequence and label each connector.
- Use `mapping` only for explicit Plan → Task correspondence. Put Plan nodes in the `plan` lane and Task nodes in the `task` lane. Keep an isolated or unmapped Task visible as an unconnected, pending-review node; never invent a line for it.
- Keep nodes and edge labels short. Preserve every source-declared edge. The current renderer lays out at most 9 nodes and 12 edges; branches, unsupported layouts, unknown endpoints, long labels, or other overflow must use its complete text fallback rather than silently dropping content.

## Keep the diagram honest and readable

- Reuse the loaded template's existing CSS tokens and font stack. Do not introduce a new palette, font download, or diagram framework.
- Draw connectors behind nodes and route them so they do not cross unrelated nodes. Keep connector lines and labels from overlapping; use the text alternative when the available space cannot stay readable.
- Mark the figure as an explanatory diagram and keep that statement visible: it does not establish a formal dependency or add source evidence. Keep diagram data separate from `relations`, source excerpts, and toy data.
- Use only data present in the manifest or source. Unknown endpoints, missing mappings, and unprovided relationships remain explicit in the text alternative; do not guess from titles, labels, order, or visual proximity.

## Accessibility and narrow screens

- The renderer's SVG includes a `title` and `desc`; keep both meaningful by giving the diagram a clear title and concise labels.
- Preserve the complete text alternative listing every node and edge. It must remain useful without color, SVG, or pointer interaction.
- Check that labels remain readable at the narrow layout (including roughly 320px). Mapping diagrams switch to Plan-above/Task-below on small screens; do not rely on left/right position alone to convey meaning.
- A reader can enlarge the Spec view's current item to full page width, which scales the diagram up with it. That is a reading aid, not extra room: the narrow layout and the text alternative must still carry the same meaning, so keep labels short.
- When geometry, text length, endpoint validity, or density exceeds the supported layout, prefer the complete text fallback. A readable text record is safer than a clipped or misleading picture.
