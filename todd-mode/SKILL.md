---
name: todd-mode
description: "Poteto workflow with context-aware discussion, plan confirmation, and runtime routing."
disable-model-invocation: true
---

# Todd mode

Apply this mode for the current session after explicit activation. Stop when the user disables it. Existing project instructions and tool permissions still apply.

## Poteto workflow

Read `poteto-mode` in full and run its matching playbook, including its principles, triggers, required roles, implementation, review, verification, completion criteria, and reply requirements. Read the playbook and referenced skills as it directs.

Todd mode layers context gathering, plan confirmation, and runtime routing onto that workflow. Poteto remains the source of truth for every other step and role. The confirmation boundary below takes precedence over Poteto's autonomy defaults, including "Just do it" and "Never Block on the Human".

## Plan-first confirmation

For each new execution task:

1. Gather needed evidence under Information gathering before presenting a 3–5-line plan covering your understanding, scope, approach, and verification. Ask only questions that materially affect the direction.
2. End the turn and wait for the user's approval. Presenting a plan is not approval. Before approval, allow bounded read-only context gathering, including delegation, and clarification. Implementation, prototypes, test execution, other delegation, and state-changing external actions begin after approval.
3. Accept clear approval such as "ok", "start", or "follow your recommendation". Execute and verify within the approved scope without asking again at every step. Pause for renewed confirmation only when the direction or scope materially changes, or an action requires separate authorization.

Answer pure questions without this execution gate, gathering evidence under Information gathering when needed. An explicit request to execute directly or run autonomously waives the plan approval for its stated scope; it does not waive existing safety or tool-permission boundaries. A new task outside that scope returns to plan-first confirmation.

## Information gathering

Before discussing the user's request, answering, recommending an approach, or planning execution, assess whether more context could change the response. Gather what is needed regardless of whether code changes are requested; reassess when the user introduces new facts or scope.

- Search or browse external resources for current facts, documentation, or comparisons requiring web evidence.
- Search and read local files for code, configuration, dependencies, or project constraints.
- Gather both when needed; investigate independent questions in parallel. Use the existing context when it already supplies sufficient evidence.

Use `rpc_subagents` for this context gathering via codemode. Set `model: { provider: "opencode-go", id: "deepseek-v4.1-flash" }` and `thinking: "low"`. Choose a descriptive `name` for the investigation target, such as "Compare deployment options" or "Locate authentication config". These overrides apply only to context-gathering tasks; other Poteto workflow roles keep their existing routing. If the model, thinking level, or required tools are unavailable, report the blocker rather than silently substituting another route.

Give each child a bounded, read-only question, the latest user request, relevant context and decisions, cwd, source pointers, required operating instructions, and a deadline. Verify the child's tools support the requested web access or local inspection; skills and extension tools are not automatically inherited. Require findings with source URLs or file paths and line references, uncertainties, and evidence gaps in the task result. Keep project files unchanged.

Wait for completed results and check the cited evidence before relying on it in discussion or a plan. The parent synthesizes findings, separates observations from inference, and discusses the implications and genuine preference decisions with the user. Information gathering is complete when each decision-relevant gap has supporting evidence or an explicit blocker. Feed the findings into the active Poteto playbook and follow its remaining steps and completion criteria.

## Runtime operations and verification

During approved tasks, delegate direct interaction with the target application or service to `worker`, including API calls, browser operations, bug reproduction, runtime debugging, and end-to-end or smoke checks. This applies whenever Poteto's workflow requires those operations, not only when the user explicitly requests testing. Set `model: "opencode-go/deepseek-v4.1-flash"`, `thinking: "xhigh"`, `context: "fork"`, and `async: true`. OpenCode Go maps this model's Pi `xhigh` level to upstream `max`. These launch overrides take precedence over Poteto's defaults, `~/.agents/pstack-models.md`, and configured worker model and thinking levels for these operations. If the requested model or reasoning level is unavailable, report the blocker rather than silently falling back to another model or lower effort. Fork the current session so the worker receives its conversation history; if forking fails, report the blocker rather than silently launching without that history.

Code and diff review, design critique, static checks, test authoring, and acceptance judgment retain their existing Poteto and pstack routing. The parent reviews runtime evidence and owns the final acceptance decision.

Include an explicit handoff with the latest user request, decisions and constraints, cwd, target URL or artifact, relevant changed files, operations to perform, and observable acceptance criteria. Include existing browser TaskSpace IDs and Page labels when continuing a browser task.

For Ego Lite operations, tell the worker to read `ego-browser` and `use-ego-browser` before using the browser. Scope the task to validation and authorized operations, with code fixes requiring separate authorization. Require a report of actions, expected versus observed results, evidence paths or screenshots, and failures or untested cases. The parent reviews the evidence and continues the Poteto playbook.

For delegation outside these overrides, follow Poteto mode and `~/.agents/pstack-models.md`.
