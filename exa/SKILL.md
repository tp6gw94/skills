---
name: exa-search
description: Use when searching for code snippets, API syntax, SDK examples, library docs, config patterns, debugging help, OR academic papers, arXiv preprints, and scientific research. Covers both Exa code-context search and research-paper search.
---

# Exa Search

Two modes over Exa MCP. Pick the right tool for the request:

- Code / API / docs → **Code Context** (`get_code_context_exa`)
- Papers / academic → **Research Paper** (`web_search_advanced_exa` with `category: "research paper"`)

## Token Isolation (Critical)

Never run Exa in main context. Always spawn a Task agent:
- Agent calls the Exa tool
- Agent deduplicates results (mirrors, forks, repeated answers/papers)
- Agent returns the minimum viable output (snippets or compact markdown/JSON)
- Main context stays clean regardless of search volume

## Mode A — Code Context

**Tool restriction:** Use ONLY `get_code_context_exa`. No other Exa tools.

**Use when:** API usage/syntax, SDK/library examples, config and setup patterns, framework how-to, or debugging that needs authoritative snippets.

**Inputs:**
- `query` (string, required)
- `tokensNum` (number, optional; default ~5000, range 1000–50000)

**Query patterns (high signal):**
- Always include the programming language (`"Go generics"`, not `"generics"`)
- Include framework + version when relevant (`"Next.js 14"`, `"React 19"`)
- Include exact identifiers: function/class names, config keys, error messages

**Token tuning:** focused snippet 1000–3000 · most tasks 5000 · complex integration 10000–20000. Avoid going larger.

**Output:** (1) minimal copy/paste-ready snippet(s), (2) version/constraints/gotchas, (3) source URLs. Deduplicate first; keep one best representative per approach.

## Mode B — Research Paper

**Tool restriction:** Use ONLY `web_search_advanced_exa` with `category: "research paper"`. No other category or tool.

**Use when:** academic papers (arXiv, OpenReview, PubMed), scientific research on a topic, literature reviews with date filtering, or papers containing specific methods/terms.

**Supported parameters:**
- Core: `query` (required), `numResults`, `type` (`auto`/`fast`/`deep`/`neural`)
- Domain: `includeDomains`, `excludeDomains`
- Date (ISO 8601): `startPublishedDate`/`endPublishedDate`, `startCrawlDate`/`endCrawlDate`
- Text: `includeText` (all), `excludeText` (any) — **single-item arrays only; 2+ items return 400. Use the query string or separate searches for multiple terms.**
- Content: `textMaxCharacters`, `contextMaxCharacters`, `enableSummary`/`summaryQuery`, `enableHighlights`/`highlightsNumSentences`/`highlightsPerUrl`/`highlightsQuery`
- Other: `userLocation`, `moderation`, `additionalQueries`, `maxAgeHours`/`livecrawlTimeout`, `subpages`/`subpageTarget`

**Output:** (1) structured list (title, authors, date, abstract summary), (2) sources with venue, (3) notes on method differences or conflicting findings.

## Quick Reference

| Need | Tool | Key arg |
|------|------|---------|
| Code snippet / API | `get_code_context_exa` | `tokensNum` |
| Academic paper | `web_search_advanced_exa` | `category: "research paper"` |

## Example

Code:
```
get_code_context_exa { "query": "Next.js 14 middleware auth redirect", "tokensNum": 5000 }
```

Paper:
```
web_search_advanced_exa {
  "query": "transformer attention efficiency",
  "category": "research paper",
  "startPublishedDate": "2024-01-01",
  "includeDomains": ["arxiv.org", "openreview.net"],
  "numResults": 15,
  "type": "auto"
}
```

## Common Mistakes

- Running Exa in main context → blows up the window. Always spawn a Task agent.
- Omitting language in code queries → cross-language noise.
- Passing 2+ items in `includeText`/`excludeText` → 400 error.
- Dumping oversized `tokensNum` → wasted context.

## MCP Configuration

```json
{
  "servers": {
    "exa": {
      "type": "http",
      "url": "https://mcp.exa.ai/mcp?tools=get_code_context_exa,web_search_advanced_exa"
    }
  }
}
```
