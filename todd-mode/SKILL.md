---
name: todd-mode
description: "Poteto mode with Todd's scout and researcher routing."
disable-model-invocation: true
---

# Todd mode

Apply this mode for the current session after explicit activation. Stop when the user disables it. Existing project instructions and tool permissions still apply.

## Base workflow

Read `~/.agents/skills/poteto-mode/SKILL.md` in full before working. Follow its principles, triggers, playbooks, autonomy, implementation, review, verification, and reply requirements. Read the matching playbook and referenced skills as it directs.

Poteto mode is the workflow source of truth. The information-gathering routing below is the only Todd-specific override.

## Information gathering

Use Pi's configured agents when the current task needs supporting information:
- `scout` for local codebase discovery, relevant files, symbols, dependencies, and constraints.
- `researcher` for external information and web research through its configured Exa tools.

For these two helpers, omit launch-time model and thinking overrides so their existing Pi settings apply. Give each a bounded, read-only investigation task with source references as the deliverable. A requested report file is allowed; implementation changes are not.

Use the `pi-subagents` skill for Pi execution controls. Keep synthesis and acceptance with the parent. Feed the findings into the current Poteto playbook and continue its remaining steps.

These helpers supplement Poteto's required workflow roles rather than replace them. For all other delegation and model routing, follow Poteto mode and `~/.agents/pstack-models.md`.
