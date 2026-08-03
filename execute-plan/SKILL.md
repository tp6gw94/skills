---
name: execute-plan
description: Use when the user wants to execute an existing execution plan produced by the write-plan skill. Runs sub-tasks in parallel within each wave and chains waves sequentially using pi-subagents.
---

You are the parent orchestrator. Execute the plan in `.plan/<slug>/task.md` by delegating every sub-task to pi-subagents. Do not do the work yourself.

## Expected plan format

`task.md` contains waves of independent sub-tasks:

```markdown
### Wave 1: <goal>
| Sub-task | Assignee | Details |
| --- | --- | --- |
| ... | worker | ... |

### Wave 2: <goal>
| Sub-task | Assignee | Details |
| --- | --- | --- |
```

- **Wave**: a group of sub-tasks that can run in parallel.
- **Sub-task**: short name of the work.
- **Assignee**: the pi-subagents target name, such as `worker`, `scout`, `reviewer`, `researcher` or a custom agent. Use this as the `agent` argument.
- **Details**: implementation hints and acceptance criteria.

If the plan does not use waves, treat the whole table as one wave.

## Preconditions

1. Use the **pi-subagents** skill for launch/wait patterns.
2. Optionally run `subagent({ action: "list" })` to discover available agents.
3. Confirm `.plan/<slug>/task.md` exists and is decision-complete. If blocking decisions remain, stop and use the **grill-me** skill first.

## Parse the plan

Read `.plan/<slug>/task.md` and extract:

- all wave goals and their sub-task rows, in order
- the `User Request`, `Key Context`, `Files`, and `Risks and Assumptions` sections, to pass to each subagent

If a sub-task's Details reference another sub-task or wave as a prerequisite, move it to a later wave or defer it until the dependency finishes.

## Execute wave by wave

For each wave, in order:

1. Launch one async subagent per sub-task in the wave.
2. Wait for **all** of them to finish before starting the next wave.

Launch prompt template for each sub-task:

```typescript
subagent({
  agent: "<Assignee>",
  context: "fresh",
  async: true,
  output: ".plan/<slug>/wave-<wave>-<assignee>-<subtask-slug>.md",
  task: `Execute this sub-task from the approved plan.

Plan file: .plan/<slug>/task.md
Wave goal: <goal>
Sub-task: <Sub-task name>
Details: <Details>

User request:
<from task.md>

Key context and risks:
<from task.md>

Relevant files:
<from task.md>

Acceptance criteria:
- <checkable completion criterion from Details>

Return: changed files, commands run with exit codes, validation evidence, surprises, and any decisions needing approval.

Also write a concise handoff to {output}: what was done, what was left undone, how to verify it, and any follow-up decisions.`
})
```

Use unique output paths for every sub-task so parallel runs do not collide. Prefer names like `wave-1-developer-auth.md` or `wave-2-tester-api.md`.

If an Assignee is not available, fall back to `worker` and note it in your summary.

Wait using `wait({ all: true })` when you have no independent work left between waves.

## Per-subagent observable artifacts

Each subagent writes its summary to a separate file under `.plan/<slug>/`. After a wave finishes, report those file paths to the user so they can observe progress without opening every subagent transcript.

At minimum, each artifact should include:

- What was done and what was left undone
- Changed files, commands run with exit codes, and validation evidence
- Surprises, blockers, and decisions needing approval
- How a human or the next wave can verify the result

## Handle failures and blockers

- If a subagent returns a decision needing user approval, stop the wave and ask the user before continuing.
- If a subagent fails, decide whether to retry, skip, or stop. Ask the user for non-recoverable failures.
- Before launching a wave that depends on files changed in the previous wave, tell the subagents to re-read those files in their task prompt.

## Completion rule

This skill is complete when every wave has been executed, all subagents have reported back, and you have reported changed files, unresolved blockers, and next steps.
