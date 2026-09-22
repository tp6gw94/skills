---
name: humanreadable-doc
description: Load when writing documents for humans — READMEs, tutorials, reports, guides, summaries. Use when readers need to grasp content fast (general, non-expert, or ADHD readers), when mermaid diagrams help, when a TL;DR should come first, or when AI tone must be removed.
---

# humanreadable-doc

Every document has one reader. Name that reader first, then write so they get the point without re-reading.

Three rules carry most of it: **conclusion before detail; one idea per block; a visual beats a prose paragraph.**

## Steps

1. **Name the reader.** Write one line — who reads this, and what they already know. Pick the closest row:

   | Reader | Lead with | Vocabulary | Length |
   |---|---|---|---|
   | Newcomer to the topic | an everyday analogy, then the term | one plain sentence per term, at first use | shortest |
   | Expert in the field | the interesting part: trade-offs, edge cases | the real terms, no analogies | dense, no recap |
   | Decision maker | impact, cost, risk, the choice in front of them | plain language, skip implementation | one page |

   Unsure? Assume they know nothing about this topic. Done when the reader is written down and every later choice follows from it.

2. **Write the TL;DR first.** 3–5 lines at the top: the question this answers, what the reader gets, the conclusion. Done when those lines alone give 80% of the answer.

1. **Cut into short blocks.** One H2/H3 covers one thing. Body runs 1–3 sentences or 3–5 bullets. Order inside a section: conclusion → detail → background, so background can be skipped for free. Done when any block reads in 30 seconds, and the first line of each section still tells the story on its own.

1. **Say it in plain words.** First use of a term gets one everyday analogy or one plain sentence, then the term itself. Done when someone outside the field can follow every sentence.

1. **Show it visually.** A flow, relationship, comparison, or timeline with more than two parts becomes a visual plus one sentence saying what it shows. Pick the smallest view that makes the point (table below). Done when no section leaves a flow, relationship, or comparison as a paragraph of prose — and a section with nothing to show gets no visual.

1. **Final check.** Done when: reader named, TL;DR on top, every block reads in 30 seconds, every term defined at first use, every flow has a visual, and the AI-tone pass below is clean.

## Pick the smallest view

The view follows the shape of the content — a process goes down, a structure goes across.

| Shape of the content | View |
|---|---|
| Process, decision, steps (time order) | mermaid `flowchart TD` |
| Structure: modules, services, files (no time order) | mermaid `flowchart LR` |
| Two or more parties calling each other over time | mermaid `sequenceDiagram` |
| Lifecycle, retries, scheduling | mermaid `stateDiagram-v2` |
| Grouping and brainstorm | mermaid `mindmap` |
| Dates and milestones | mermaid `timeline` |
| Logic or algorithm | pseudocode block |
| Nesting at runtime | call tree (indented text) |
| Nesting in the UI or code tree | component tree (`tsx` block, note owning file per line) |
| Jobs of each directory | shallow file tree, one comment per entry |
| What changed, when the surrounding shape is already known | `diff` block — file tree, call tree, or control-flow shape matching the topic |
| New code the reader will copy | full code block |
| Too dense for any of the above | one HTML file, built with the `explain-diff-html` skill (code change) or `visual-eli5` skill (beginner topic) |

One visual carries one point. Labels are short plain phrases, one lead-in sentence before, one conclusion after. Use one or several — never all of them.

## Keeping attention

- **Bold** key points, at most 2 per paragraph — all-bold means no-bold.
- Bullets are action + result, one idea each, no nested clauses.
- Every long paragraph gets an anchor for the eye: a heading, a diagram, or a list.
- Put each visual next to the text it supports, carrying only the calls, files, props, states, and boundaries that point needs.

## Before and after

Before — detail first, prose only, term undefined, reader unnamed:

> The `TtlCache` wrapper stores entries in an `OrderedDict` and evicts the least recently used entry once the capacity of 512 is exceeded, while also expiring entries whose age exceeds the TTL of 60 seconds, which reduces upstream `fetch_config` calls during the config reload path.

After — reader named (a new teammate), conclusion first, one term defined, the flow drawn:

> **Config reads are cached for a minute.** This page explains the cache in front of `fetch_config`; you need it when you change config reading or debug a stale value.
>
> The cache keeps the 512 most recently used config values for 60 seconds. Reads that hit it never reach `fetch_config`.
>
> ```mermaid
> flowchart TD
>   A[read config] --> B{cached and under 60s?}
>   B -- yes --> C[return cached value]
>   B -- no --> D[call fetch_config]
>   D --> E[store with a timestamp]
> ```
>
> The 512-entry limit matters: eviction drops the *least recently used* entry, not the oldest. A hot key can stay forever, a cold one leaves as soon as the cache is full.

## Removing AI tone

Before publishing, run the whitelist in the `lieflat-less-ai-tone` skill over the draft: it owns the rule list, the triggers, and the do-not-change list. Apply the hits only — text that trips no rule stays verbatim. Closing AI tells include hollow openers ("in today's fast-paced world"), reveal dashes, and empty "in short:" prompts.

## Boundaries

Simplify the wording, never the facts. Trade-offs, numbers, limits, and caveats stay — a tutorial may cover the common 80%, a reference must be complete. Write in the reader's language: no invented persona, no forced short sentences that lose meaning.
