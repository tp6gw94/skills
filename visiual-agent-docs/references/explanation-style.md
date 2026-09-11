# Explanation style

Make a dense source item understandable on first pass without changing what the source says. These rules apply in whatever language the content uses; the examples below are illustrative.

## Four layers, in reading order

| Layer | Field | Budget | Passing test |
|---|---|---|---|
| Plain claim | `summary` | 1 sentence, about 30 words or 45 CJK characters | a newcomer can repeat it back in their own words |
| Concrete scene | `example` | 1–2 sentences | names a specific actor, action, and outcome |
| Vocabulary | `glossary` | at most 5 entries, 1 sentence each | every non-everyday term used above is covered |
| Mechanism | `details` | 2–4 sentences | says how and why, and adds nothing the source does not support |

A title may keep the source's ID or label, then read as a plain claim rather than a stack of nouns: `A1 — the upstream run must finish successfully`, not `A1 — upstream conclusion constraint`.

## Rules that make text readable

- One idea per sentence. Split at "and", "because", and semicolons.
- On first use of a source term, put the plain words first and the term second: "the gate that blocks merging (merge gate)".
- Prefer verbs over nominalizations: "checks the files" beats "performs file verification".
- Prefer nouns the reader already owns: PR, file, teammate, button, branch.
- Say what happens, not what is "supported", "handled", or "ensured".
- Keep identifiers exact. Field names, file paths, IDs, and status values stay verbatim; explain around them instead of paraphrasing them.
- Cut filler: no "simply", no "obviously", no "all you need to remember", no praise, no coaching the reader.

## Before and after

- Before: "Triggered by `workflow_run`, the policy job emits `eligible` under a fail-closed premise."
  After: "After the review run finishes, a second flow defined on `main` re-checks the PR; anything it cannot confirm counts as not eligible."
- Before: "B5 — Idempotency: no repeated POST when the same App already has an `APPROVED` review for the same head SHA."
  After: "The same commit never gets approved twice; re-running the flow does not add a second approval to the PR."
- Before: "The risk is accepted; blast radius is recoverable through revert."
  After: "This risk is left open: if the agent is fooled, bad code reaches `main` and the only fix is reverting it afterwards."

## Glossary entries

- Cover only terms that appear in the source or in the explanation above them.
- One sentence per entry: what it is, plus why it matters here. No borrowed textbook definitions, no invented history.
- Skip a term the summary already avoided; a glossary is not a keyword list.
- Five entries is a ceiling, not a target. An item that needs more is usually two items.
- `term` stays exactly as the source writes it so the reader can search the source for it.

## What plain language must not do

- Do not create requirements, boundaries, relations, or acceptance criteria the source does not state.
- Do not swap a source term for a friendlier one inside `acceptance`, `risks`, `status`, relation labels, or diagram edges that carry source meaning.
- Do not hide a limitation, an unknown, or an "ask first" boundary inside an analogy.
- Do not invent numbers, names, repositories, or paths to make an example concrete. When the source has no specifics, keep the example obviously illustrative and mark it synthetic.
- Do not restate the source excerpt as the explanation. The excerpt is already on the page.

## Self-check before rendering

1. Can a reader who has never seen this repository restate the `summary` correctly?
2. Does every non-everyday term in the summary and example appear in the `glossary`?
3. Is there exactly one concrete scene, and is it either source-grounded or marked synthetic?
4. Are the limitations still visible, in the same plain register as the rest?
5. Does any sentence carry two ideas, or any field repeat another field?
