---
name: todd-mode
description: "Align requirements and scope through evidence-backed discussion, then execute and verify with pstack."
disable-model-invocation: true
---

# Todd mode

Apply this mode for the current session after explicit activation. Stop when the user disables it. Existing project instructions and tool permissions still apply.

## Classify first

Only a narrow pure question with sufficient current evidence and no explicitly invoked workflow may be answered directly without loading Poteto or spawning an explainer. An explicit `/how` or supplied how invocation still requires how's explainer. Missing evidence requires bounded, read-only RPC gathering below. Substantive investigation or execution requires [pstack workflow](references/pstack-workflow.md); explicit workflows retain their required roles and steps.

Keep requirements alignment and final acceptance with the parent. Read `~/.agents/pstack-models.md` at task start if it exists; use pstack's role routing, model settings, reasoning levels, and fallback policy for all delegation. The alignment boundary below takes precedence over Poteto's autonomy defaults, including "Just do it" and "Never Block on the Human".

## Requirements alignment

For each new execution task:

1. Assess the available context. If decision-relevant information is missing, delegate bounded, read-only investigation under Information gathering and check the evidence before discussing requirements.
2. Discuss the intended outcome, scope boundaries, constraints, and observable acceptance criteria with the user. Separate established facts from assumptions and resolve product or preference decisions with the user. This is requirements clarification, not an implementation plan. Alignment is complete when these points are explicit, each decision-relevant gap has evidence or an acknowledged blocker, and the user confirms the shared understanding. End the turn and wait for that confirmation; a summary alone is not confirmation. Until then, work stays within read-only gathering and clarification.
3. After confirmation, enter the matching pstack playbook with the agreed requirements and evidence. Implementation, prototypes, test execution, and state-changing external actions follow that workflow within the confirmed scope. Pause for renewed alignment only when direction or scope materially changes, or an action requires separate authorization.

Answer pure questions without this execution gate, gathering evidence under Information gathering when needed. An explicit request to execute directly or run autonomously waives alignment confirmation for its stated scope; existing safety and tool-permission boundaries still apply. A new task outside that scope returns to requirements alignment.

## Information gathering

Before discussing requirements, answering, or recommending an approach, assess whether more context could change the response. Gather what is needed regardless of whether code changes are requested; reassess when the user introduces new facts or scope.

- Search or browse external resources for current facts, documentation, or comparisons requiring web evidence.
- Search and read local files for code, configuration, dependencies, or project constraints.
- Gather both when needed; investigate independent questions in parallel. Use the existing context when it already supplies sufficient evidence.

Use `rpc_subagents` for this context gathering via codemode, following pstack's investigation role routing. Choose a descriptive `name` for the investigation target, such as "Compare deployment options" or "Locate authentication config".

Give each child a bounded, read-only question, a concise actionable summary of the latest user request, relevant decisions, cwd, source pointers, required operating-instruction pointers to read fully, and a deadline. Bound returned findings and excerpts to decision-relevant evidence. Verify the child's tools support the requested web access or local inspection; skills and extension tools are not automatically inherited. Require findings with source URLs or file paths and line references, uncertainties, and evidence gaps in the task result. Keep project files unchanged.

Wait for completed results and check the cited evidence before relying on it. The parent synthesizes findings, separates observations from inference, and brings the evidence into requirements alignment or the answer. Information gathering is complete when each decision-relevant gap has supporting evidence or an explicit blocker.

## Runtime operations and verification

For execution and substantive investigation, follow [pstack workflow](references/pstack-workflow.md). The parent checks necessary source evidence, reviews results against agreed acceptance criteria, and owns final acceptance. Keep operations within confirmed scope and existing authorization boundaries.
