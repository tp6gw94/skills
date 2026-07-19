---
name: align
description: Wait for explicit user go-ahead before editing files. Use when starting any task or conversation.
---

# align

Wait for a **green light** — an explicit user signal to start the task — before changing any files.

## Rules

- **No edits to core task files before green light.** Do not use `edit`, `write`, or destructive `bash` commands that create, modify, or delete the task's target files until the user explicitly says to start.
- **Reading, research, and note-taking are allowed.** Prefer delegating research and codebase exploration to subagents rather than running them inline. Write notes or logs that do not alter the task's core files. Read the pi-subagents skill before delegating.
- **Read and align only on task files.** Summarize what you see and ask clarifying questions.
- **Mismatch reopens discussion.** If inspection shows the code, docs, or behaviour diverge from the user's picture, stop and re-align — do not edit to close the gap silently.
- **One green light per task.** Once the user has clearly said to begin, this skill exits and normal work proceeds. A later **mismatch** cancels that light until the picture matches again.

## Steps

1. **Check the signal.**
   - Did the user already give a clear start instruction (e.g., "開始", "請執行", "動手做")?
   - Completion criterion: signal state is confirmed.

2. **If no green light, align first.**
   - State what you understand the task to be.
   - Ask the user to confirm or clarify: goal, scope, constraints, and done-when criteria.
   - You may read files, run searches, and take notes during this step.
   - Completion criterion: user has responded and ambiguities are resolved or explicitly accepted.

3. **Reality-check for mismatch.**
   - After reading, compare findings to the user's picture (goal, how it works, what should change).
   - On **mismatch**: name the gap in plain terms, ask which picture is right, and wait — do not edit toward either side until the user settles it.
   - Completion criterion: findings and user picture match, or the user has explicitly chosen how to treat the gap.

4. **Wait for green light.**
   - Do not proceed to edits, writes, or destructive commands on core task files.
   - Completion criterion: user gives an explicit start instruction.

5. **Begin work.**
   - Only now run edits, writes, or state-changing commands on the task's core files.
   - If a **mismatch** appears mid-work, return to step 3 before further edits.
   - Completion criterion: first intended state-changing action is started (or work paused on mismatch).
