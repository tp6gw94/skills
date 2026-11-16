---
name: decision-audit
description: Surface undiscussed settings, defaults, and assumptions adopted in the current task so the user can review decisions made on their behalf.
disable-model-invocation: true
---

# Implicit decision audit

Expose what filled the gaps between the user's request and the current result. This is a read-only audit: report choices for the user to judge; changing them requires a separate request.

## 1. Establish the boundary

Use the user's named target, or otherwise the current task's latest plan or result. State the inspected material and any unavailable context in one sentence. Label plan choices as proposed; distinguish implementation settings from demonstrated runtime behavior.

Separate user-specified requirements, previously disclosed choices, and undiscussed choices. Keep the first two outside the main list. An assistant's earlier proposal is disclosure, not user approval; silence is not approval either.

Completion: the target and the boundary between discussed and undiscussed choices are explicit.

## 2. Trace the choices

Compare the request and visible discussion with the relevant plan, artifact, diff, configuration, or tool results. Follow direct references needed to establish a choice's effective behavior. Inspect only material relevant to the target.

Look for task-relevant choices in:

- Settings and behavior: omitted parameter values, framework or runtime defaults, permissions, persistence, time and locale, limits, retries, and failure handling.
- Scope and tradeoffs: assumed audience, requirement interpretation, exclusions, conflicting priorities, and choices trading quality against time, cost, or complexity.
- Acceptance: success thresholds, selected checks, and behavior left unverified but treated as complete.

These are search lenses, not a mandatory output checklist. Include a choice when a plausible alternative would change the result, its scope, or its consequences. Ordinary defaults belong alongside high-stakes decisions when they affect the task.

Classify each candidate by evidence:

| Origin | Evidence required |
| --- | --- |
| Model-selected | Visible work or conversation supports that the assistant supplied the choice. |
| Inherited | Pre-existing code, configuration, instructions, or a verified dependency default supplies the behavior; name that authority. |
| Inferred | The result suggests a choice, but its value or origin is not established. State the inference and the missing evidence. |
| Unknown | A relevant choice remains unresolved. State what is missing rather than supplying a plausible default. |

An omitted setting alone does not establish its effective default. Resolve it from the applicable configuration or version-specific source, or keep it unresolved. Use visible evidence for attribution and recorded reasons for rationale; private reasoning is not an audit source.

Completion: every candidate has a supported origin or an explicit evidence gap; duplicate effects of the same choice are merged.

## 3. Return the decision ledger

Return the audit directly in chat, in the user's language. File output requires an explicit user request. Lead with the choice whose consequences most deserve their attention.

### Undiscussed choices

| Setting or decision | Current value or behavior | Origin and evidence | Consequence | Plausible alternative |
| --- | --- | --- | --- | --- |

Use one row per established choice. Cite a file location, configuration key, visible statement, or tool result. Describe specific behavioral consequences rather than generic warnings. Order rows by consequences for other people, reversibility, and then ordinary operational impact. Keep all qualifying rows; a summary is not a substitute for the ledger.

### Unresolved assumptions

List inferred and unknown items separately from established choices. For each, state what the current result depends on, what remains uncertain, and the smallest observation or check that would resolve it. Include only gaps connected to the actual task.

### Review first

Highlight up to three decisions needing human judgment because of their effect on users, data, money, or maintenance. For each, give a concrete condition that would make the current choice unsuitable, plus a way to check that condition. When an item concerns verification, state both what the existing check established and what it left open. Omit this section when no such decision is supported.

When a section has no findings, say so briefly. Limit any absence claim to the inspected material. Finish with the report, not an approval gate, a questionnaire, or an implementation change.

Completion: each established choice has evidence, a consequence, and an alternative; each unresolved item has a resolving check; high-consequence choices are easy to find.
