---
name: write-plan
description: Use when the user asks for a plan document, execution plan, project plan, or task breakdown. Delegates planning to the planner subagent via pi-subagents and produces task.md under .plan/<slug>/.
---

You are the parent orchestrator. Do not write the plan yourself. Gather the user's request and relevant context, then launch the `planner` subagent to produce the plan in the format below.

## Plan folder

Put the plan in `.plan/<slug>/`:

- If the user provides a folder path, use it.
- Otherwise derive a short slug from the task title, e.g. `.plan/add-login/`.

## Gather context

Before launching the planner, use the current conversation context and read the files the user mentions or any project files clearly related to the request.

If decisions are still blocked after that — scope unclear, tradeoffs unresolved, missing product choices — use the **grill-me** skill until shared understanding is reached. Do not launch the planner while blocking decisions remain.

## Plan output format

The planner must write `.plan/<slug>/task.md` in this format:

```markdown
# Task: <short description>

## User Request
<faithful summary>

## Key Context
<constraints and repo facts that affect implementation>

## Execution Plan
### Wave 1: <goal>
| Sub-task | Assignee | Details |
| --- | --- | --- |

### Wave 2: <goal>
| Sub-task | Assignee | Details |
| --- | --- | --- |

## Files
<absolute paths when known; otherwise precise discovery targets>

## Risks and Assumptions
<only material risks, defaults, and acceptance criteria>
```

Sub-task guidelines:

- Make each sub-task a vertical slice: one coherent, end-to-end behavior change across files, layers, docs, and tests.
- Group independent sub-tasks into parallel waves; keep dependent work sequential and reference the blocking wave/sub-task.
- The `Assignee` column is a pi-subagents target name such as `developer`, `designer`, `tester`, `debugger`, `explorer`, or any custom subagent. Keep labels consistent.
- Every sub-task must end with a clear, checkable completion criterion.
- Use absolute paths for files; if a path is unknown, write a precise discovery target.
- Embed Mermaid diagrams only when they reduce ambiguity, and place them next to the relevant sub-task.
- Do not include nice-to-have work. Do not write source code.

## Launch planner

Delegate plan writing to the `planner` subagent through pi-subagents. The planner should read this skill file to confirm the output format before writing the plan.

```typescript
subagent({
  agent: "planner",
  context: "fresh",
  async: true,
  task: `Write a decision-complete execution plan for the following request.

Plan folder: .plan/<slug>/

User request:
<faithful summary>

Key context:
<constraints and repo facts>

Follow the write-plan skill's plan output format. Then write .plan/<slug>/task.md only.

Return the absolute path of task.md and a one-sentence plan summary.`
})
```

If you have independent work while `planner` runs, do it. Otherwise use `wait()` instead of ending the turn so the planner is not abandoned.

## After planner

After `planner` finishes, read `.plan/<slug>/task.md`.

If the plan still surfaces blocked decisions, open risks that need a choice, or unresolved assumptions, load and run **grill-me** on those points. Fold the answers into `task.md` (edit or re-run planner) until the plan is decision-complete.

## Completion rule

This skill is complete when `.plan/<slug>/task.md` exists and every blocking decision has been resolved via context or grill-me.
