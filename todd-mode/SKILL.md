---
name: todd-mode
description: "Poteto mode with plan-first confirmation and Todd's research and verification routing."
disable-model-invocation: true
---

# Todd mode

Apply this mode for the current session after explicit activation. Stop when the user disables it. Existing project instructions and tool permissions still apply.

## Base workflow

Read `~/.agents/skills/poteto-mode/SKILL.md` in full before working. Follow its principles, triggers, playbooks, autonomy, implementation, review, verification, and reply requirements. Read the matching playbook and referenced skills as it directs.

Poteto mode is the workflow source of truth except for Todd's plan-first confirmation and routing overrides below. The confirmation boundary takes precedence over Poteto's autonomy defaults, including "Just do it" and "Never Block on the Human".

## Plan-first confirmation

For each new execution task:

1. Present a 3–5-line plan covering your understanding, scope, approach, and verification. Ask only questions that materially affect the direction; use minimal read-only inspection when needed to ground the plan.
2. End the turn and wait for the user's approval. Presenting a plan is not approval. Before approval, limit work to that inspection and clarification; implementation, prototypes, tests, delegation, and external actions begin after approval.
3. Accept clear approval such as "ok", "start", or "follow your recommendation". Execute and verify within the approved scope without asking again at every step. Pause for renewed confirmation only when the direction or scope materially changes, or an action requires separate authorization.

Answer pure questions directly without this execution gate. An explicit request to execute directly or run autonomously waives the plan approval for its stated scope; it does not waive existing safety or tool-permission boundaries. A new task outside that scope returns to plan-first confirmation.

## Information gathering

Use Pi's configured agents when the current task needs supporting information:
- `scout` for local codebase discovery, relevant files, symbols, dependencies, and constraints.
- `researcher` for external information and web research through its configured Exa tools.

For these two helpers, omit launch-time model and thinking overrides so their existing Pi settings apply. Give each a bounded, read-only investigation task with source references as the deliverable. A requested report file is allowed; implementation changes are not.

Use the `pi-subagents` skill for Pi execution controls. Keep synthesis and acceptance with the parent. Feed the findings into the current Poteto playbook and continue its remaining steps.

These helpers supplement Poteto's required workflow roles rather than replace them.

## Runtime operations and verification

During approved tasks, delegate direct interaction with the target application or service to `worker`, including API calls, browser operations, bug reproduction, runtime debugging, and end-to-end or smoke checks. This applies whenever Poteto's workflow requires those operations, not only when the user explicitly requests testing. Set `model: "opencode-go/deepseek-v4.1-flash"`, `thinking: "xhigh"`, `context: "fork"`, and `async: true`. OpenCode Go maps this model's Pi `xhigh` level to upstream `max`. These launch overrides take precedence over Poteto's defaults, `~/.agents/pstack-models.md`, and configured worker model and thinking levels for these operations. If the requested model or reasoning level is unavailable, report the blocker rather than silently falling back to another model or lower effort. Fork the current session so the worker receives its conversation history; if forking fails, report the blocker rather than silently launching without that history.

Code and diff review, design critique, static checks, test authoring, and acceptance judgment retain their existing Poteto and pstack routing. The parent reviews runtime evidence and owns the final acceptance decision.

Include an explicit handoff with the latest user request, decisions and constraints, cwd, target URL or artifact, relevant changed files, operations to perform, and observable acceptance criteria. Include existing browser TaskSpace IDs and Page labels when continuing a browser task.

For Ego Lite operations, tell the worker to read `~/.agents/skills/ego-browser/SKILL.md` and `~/.agents/skills/use-ego-browser/SKILL.md` before using the browser. Scope the task to validation and authorized operations, with code fixes requiring separate authorization. Require a report of actions, expected versus observed results, evidence paths or screenshots, and failures or untested cases. The parent reviews the evidence and continues the Poteto playbook.

For delegation outside these overrides, follow Poteto mode and `~/.agents/pstack-models.md`.
