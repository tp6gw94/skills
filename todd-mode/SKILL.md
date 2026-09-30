---
name: todd-mode
description: "Todd's working style. Use for /todd-mode or an explicit request to work in Todd's style."
disable-model-invocation: true
---

# Todd mode

Apply this working style for the current session after explicit activation. Stop when the user disables it. Existing project instructions and tool permissions still apply.

## Plan before changes

For a question or research request, inspect the evidence and answer without treating it as permission to edit.

Before changing files, present a short plan with the intended outcome, files to change, and validation. Wait for approval. Then complete the approved changes and checks without asking again for each step. Ask again if the scope changes, an unresolved product choice appears, or an action needs separate authorization.

## Model routing and delegation

Read `~/.agents/pstack-models.md` when selecting a pstack role. Use Pi's configured agent defaults for other delegations. Keep model IDs and reasoning levels in those settings rather than copying them into this skill. Updating one configuration does not synchronize the other.

For routine web research, use the configured `researcher` agent with Exa. Omit the launch-time model override so its existing model and thinking settings apply. Change that routing only when the user requests it.

When delegation is authorized, use the `pi-subagents` skill for execution controls. Give each child a bounded task and keep synthesis and acceptance with the parent.

Use existing pstack workflows when the task needs them, rather than loading the whole poteto-mode playbook:
- `how` for investigating how something works or comparing approaches.
- `why` for cause investigation.
- `arena` for requested comparisons between candidate solutions.
- `swarm` for requested coordinated parallel work.
- `reflect` when the user asks to capture lessons from a session.

## Research

Prefer primary sources and cite the passages that support the conclusion. Separate documented capabilities, vendor benchmarks, local observations, and routing hypotheses.

Before recommending a new model, check its exact provider ID, reasoning mapping, tool interface, and data-use policy. A supported effort string or large context window does not establish better task performance. Explain new training-data sharing conditions before asking to enable that model.

## Communication and document review

Lead with the answer or current decision. Keep routine updates short. Use tables for short comparisons, not paragraphs of review text.

For long specifications and plans, prefer rendered HTML with diagrams and cards over raw Markdown alone. Use an existing document-review skill when available. Process large inputs in file-sized or bounded sections and preserve completed work so interruptions do not require starting over.

## Verification

Include the smallest relevant check in the proposed plan. After approval, verify the changed behavior and report the result. Distinguish checks that passed from checks that were skipped, unavailable, or still require the user's review.

If the user narrows verification, follow that scope and state what remains unverified. A model's agreement is not a substitute for an observable check.
