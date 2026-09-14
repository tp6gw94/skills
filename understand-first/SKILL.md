---
name: understanding-first-workbook
description: Create or revise an understanding-first workbook, or incorporate its review feedback.
---

# Understanding-first workbook

For initialization or generation commands, use [the package guide](README.md). Resolve workbook data paths against the project target; resolve bundled tools and resources against this skill.

## Route the request

1. Resolve the caller project's workbook before reading sources. An explicit target supplied by the user wins. Otherwise search the caller project (excluding this skill/package) for directories containing both `agent-context.json` and `idea.html`.
2. One match is **RESUME**: read that target's `agent-context.json`, then its current phase sources and review JSON. Multiple matches are ambiguous: ask which target. No match is **NEW**: use a user-specified destination or choose `workbooks/<task-slug>/` in the caller project and state that location. Pass it explicitly to the initializer; never use this package's sample or old workbook context.
3. On **NEW**, accept the requested starting phase (`idea`, `spec`, `plan`, `build`, or `ship`). The initializer creates only that phase, marks it awaiting chat approval, and starts with empty review data. Do not invent approvals or history for earlier phases. On **RESUME**, do not initialize or replace local context/data.

## Phase references

Read only the reference for the current phase:

- [Idea](references/idea.md) — frame the problem, user, value, scope, and testable assumptions.
- [Spec](references/spec.md) — state observable behavior, scenarios, edge cases, non-goals, and acceptance.
- [Plan](references/plan.md) — order traceable thin slices with dependencies, outputs, and verification.
- [Build](references/build.md) — record implementation evidence, tests, and deviations within scope.
- [Ship](references/ship.md) — make a scoped, evidence-backed GO/NO-GO assessment.

Read another phase reference only when an explicit change affects that phase's decisions or evidence. Missing earlier phases are acceptable: use supplied requirements, code, and evidence; label assumptions and ask only blockers. Do not load all phase references.

## Working contract

- Deliver one offline `idea.html` with same-page phases. The reader uses HTML; the Agent edits the target's source files.
- Advance phases only after explicit user approval in chat. Navigation, replies, Resolve, and status labels are not approval. Ship is a read-only GO/NO-GO assessment, never deployment permission.
- Author content as useful cards and diagrams with stable `data-item-id` values. Keep the existing review actions, selection comments, inline follow-ups, immutable Agent replies, and recoverable soft deletion. Use vertical cards even for short comparisons, not tables. Prefer useful diagrams and toys; diagrams are not tables. Toys use labeled example data isolated from real discussions and storage.
- Review JSON is the sole authoring source for Agent review data. Generate or data-sync it into HTML; preserve IDs, provenance, timestamps, revisions, replies, `originalReview`, resolved/deleted records, drafts, and other phases. Open-only TOON is transport, not backup.
- With an explicit target, invoke the generator and template from this skill's bundled `resources/` using absolute paths; do not rely on process cwd. The bundled generator also carries the official offline TOON codec. Content generation updates authored content and seeds only; it does not regenerate the shared runtime/CSS.
- Finish with focused generation/data checks and relevant tests. Report what was actually checked and what remains unverified; keep project context and implementation details in the target, not in this router.
