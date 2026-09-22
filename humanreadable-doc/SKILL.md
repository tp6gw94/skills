---
name: humanreadable-doc
description: Load when writing documents for humans — READMEs, tutorials, reports, guides, summaries. Use when readers need to grasp content fast (general, non-expert, or ADHD readers), when mermaid diagrams help, when a TL;DR should come first, or when AI tone must be removed.
---

# humanreadable-doc

Write documents a 5-year-old can follow and an ADHD reader can stay with. Core principles: **conclusion before detail; one idea per screen; a diagram or list beats a prose paragraph.**

## Steps

1. **Write the TL;DR first.** Put a 3–5 line summary at the top: what question the document answers, what the reader gets, what the conclusion is. Done when reading only this block gives 80% of the answer.
2. **Cut into short blocks.** Each H2/H3 section covers one thing; body text runs 1–3 sentences or 3–5 bullets. Done when any block reads in 30 seconds.
3. **Explain in plain words.** Define each term the first time it appears with one everyday analogy or plain sentence, then use the term. Done when a person unfamiliar with the field can follow every sentence.
4. **Show it visually.** When content involves flows, steps, architecture, relationships, timelines, or state changes with more than 2 elements, add a visual plus one sentence saying what it shows. Pick the smallest view that makes the key point clear (table below). Done when every section has a diagram, sketch, or list, with no wall-of-prose paragraphs.
5. **Run the AI-tone check.** Go through the whitelist below item by item, rewrite only the hits, leave unmatched text verbatim. Done when every item was checked and every change maps to a numbered rule.
6. **Final check.** Done when: TL;DR is on top, every block reads in 30 seconds, every term is plainly defined at first use, every flow has a diagram, and the AI-tone whitelist fully passes.

## Pick the smallest view

| Situation | View |
|-----------|------|
| Flow, decision, steps | mermaid `flowchart TD` |
| Multiple parties, API calls, conversations | mermaid `sequenceDiagram` |
| Brainstorming, categorization | mermaid `mindmap` |
| State transitions (lifecycle, scheduling) | mermaid `stateDiagram-v2` |
| System modules, service relationships | mermaid `flowchart LR` |
| Timeline, milestones | mermaid `timeline` |
| Logic or algorithm | pseudocode block |
| Runtime control flow / nesting | call tree (indented text) |
| UI structure with state/module boundaries | component tree (`tsx` block, note owning file per line) |
| File responsibilities, directory layout | shallow file tree with one comment per entry |
| What changed, where surrounding shape is known | `diff` block — component, file-tree, call-tree, or control-flow shape matching the topic |
| Whole block is new, or reader needs a copyable target | full code block |
| UI, layout, state comparison, or concept too dense for the above | one focused HTML file (diagram/infographic/short deck), match product colors and components, real labels, desktop + mobile, then `open` it |

One visual carries one point; labels are short plain phrases; one lead-in sentence before, one conclusion after. Use one or several visuals — rarely all; never overwhelm.

## ADHD-friendly rules

- Mark key points with **bold**, at most 2 per paragraph — all-bold means no-bold.
- Bullets are action + result, one idea per bullet, no nested clauses.
- Every long paragraph gets a visual anchor (heading, diagram, or list) for the eye to land on.
- Section order is always: conclusion → detail → background. Background goes last so readers can skip it without losing anything.
- Place each visual next to the short text it supports, keeping only the calls, files, props, states, and boundaries needed for the current point.

## AI-tone whitelist

Whitelist style: rewrite only the hits listed below; all other text stays verbatim. Keep changes to the minimum needed to fix the hit; no incidental polishing, no adding or removing information (numbers, dates, hedges like "may/usually" all stay). Triggers cover both English and Chinese source text; where an example is language-specific it is labeled.

| # | Trigger | Fix |
|---|---------|-----|
| 1 | Refutation setup: inventing a misconception the reader never had, then debunking it ("not X, but Y", "rather than… it's…", "the real answer is the opposite") | State the judgment directly, positive first, then evidence |
| 2 | Two or more commas/stop-lists chaining 3+ items in one sentence | Summarize when possible; otherwise break the parallel structure of one item (inside Markdown lists: leave as-is) |
| 3 | Adjacent sentences sharing the same syntactic skeleton (same comma spots, same component order, similar length); three peer examples padded in one paragraph | Re-shuffle one sentence's structure; merge peer examples and reorder emphasis, deleting nothing |
| 4 | Reveal-style dash ("the answer is simple — focus") | Write a full sentence, or use a comma/period |
| 5 | Colon overuse: "in short:" / "the key is:" prompt phrases introducing content; empty sentence ending in a colon merely announcing a list | Delete uninformative prompts; if the phrase carries the link, swap the colon for a comma/period; rewrite the empty sentence with content or delete it |
| 6 | Numbered headings running through all headings ("一、二、三", "First,… Second,…", "I. II. III.") | Drop the numbering, keep the heading text (Markdown ordered lists stay) |
| 7 | Personified ideal: "like a wise mentor", "a tireless reviewer" plus praise modifiers | Say what it actually does; metaphors themselves stay |
| 8 | Concrete numbers/times already in the source covered by vague words ("significantly improved", "greatly increased"); nominalized structures ("completed the… of…", "achieved an improvement in…") | Lift the concrete value into the vague word's slot; restore the verb; if the source has no data, only restore the verb — never invent numbers |
| 9 | Openers "simply put", "bottom line", "to cut to the chase" | Delete, give the judgment directly |
| 10 | Translationese: pre-noun modifiers so long the reader must re-read (Chinese: two consecutive "的" or a modifier over 15 chars; English: a stacked clause before the noun); sentence-initial "When…, …"; topic shells ("for…, regarding…, in terms of…" / 「對於…來說」「關於…」); sentence-initial connectives ("However, Therefore, Furthermore, In summary" / 「然而」「因此」「此外」「總而言之」); "This means…" restating the previous sentence | Split the sentence, drop the shell, move the connective after the subject, merge the restatement into the previous sentence |
| 11 | Non-first paragraph opening with a comment ("sounds like", "notably", "the key is") with no back-reference | Add "this/that" or name what is being commented on |
| 12 | Hollow openers ("In today's fast-paced world…"), hollow closers ("let's embrace…") | First sentence states the matter; closing becomes a concrete next step: who, what, when |

**Not AI tone — do not change:** passive voice, nominalization, long sentences as such; same-sentence parallelism ("boost efficiency, cut costs"); standalone metaphor paragraphs; questions and "first… then…" in body text; uniform sentence/paragraph length; adding filler particles or swapping pronouns.

## Boundaries

Never simplify away correctness, trade-offs, or limits for the sake of simplicity: simplify the wording, not the facts. Depth follows the document type — a tutorial may cover the common 80% of cases; a reference must be complete.
