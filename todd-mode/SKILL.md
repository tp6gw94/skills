---
name: todd-mode
description: "Poteto mode with Todd's research and verification routing."
disable-model-invocation: true
---

# Todd mode

Apply this mode for the current session after explicit activation. Stop when the user disables it. Existing project instructions and tool permissions still apply.

## Base workflow

Read `~/.agents/skills/poteto-mode/SKILL.md` in full before working. Follow its principles, triggers, playbooks, autonomy, implementation, review, verification, and reply requirements. Read the matching playbook and referenced skills as it directs.

Poteto mode is the workflow source of truth. The routing rules below are the only Todd-specific overrides.

## Information gathering

Use Pi's configured agents when the current task needs supporting information:
- `scout` for local codebase discovery, relevant files, symbols, dependencies, and constraints.
- `researcher` for external information and web research through its configured Exa tools.

For these two helpers, omit launch-time model and thinking overrides so their existing Pi settings apply. Give each a bounded, read-only investigation task with source references as the deliverable. A requested report file is allowed; implementation changes are not.

Use the `pi-subagents` skill for Pi execution controls. Keep synthesis and acceptance with the parent. Feed the findings into the current Poteto playbook and continue its remaining steps.

These helpers supplement Poteto's required workflow roles rather than replace them.

## User-requested verification

When the user requests verification or actual testing through Ego Lite, delegate the requested operations to `worker` with `model: "opencode-go/deepseek-v4.1-flash"`, `context: "fork"`, and `async: true`. Keep the worker's configured thinking level. Fork the current session so the worker receives its conversation history; if forking fails, report the blocker rather than silently launching without that history.

Include an explicit handoff with the latest user request, decisions and constraints, cwd, target URL or artifact, relevant changed files, operations to perform, and observable acceptance criteria. Include existing browser TaskSpace IDs and Page labels when continuing a browser task.

For Ego Lite operations, tell the worker to read `~/.agents/skills/ego-browser/SKILL.md` and `~/.agents/skills/use-ego-browser/SKILL.md` before using the browser. Scope the task to validation and authorized operations, with code fixes requiring separate authorization. Require a report of actions, expected versus observed results, evidence paths or screenshots, and failures or untested cases. The parent reviews the evidence and continues the Poteto playbook.

For delegation outside these overrides, follow Poteto mode and `~/.agents/pstack-models.md`.
