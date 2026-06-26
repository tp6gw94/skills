---
name: align
description: Use when starting any conversation - establishes how to find and use skills, requiring Skill tool invocation before ANY response including clarifying questions.
---

# align

Wait for a **green light** — an explicit user signal to start the task — before changing any files.

## Rules

- **No edits to core task files before green light.** Do not use `edit`, `write`, or destructive `bash` commands that create, modify, or delete the task's target files until the user explicitly says to start.
- **Reading, research, and note-taking are allowed.** You may read files, run non-destructive queries, search the web, and write notes or logs that do not alter the task's core files.
- **Read and align only on task files.** Summarize what you see and ask clarifying questions.
- **One green light per task.** Once the user has clearly said to begin, this skill exits and normal work proceeds.

## Steps

1. **Check the signal.**
   - Did the user already give a clear start instruction (e.g., "開始", "請執行", "動手做")?
   - Completion criterion: signal state is confirmed.

2. **If no green light, align first.**
   - State what you understand the task to be.
   - Ask the user to confirm or clarify: goal, scope, constraints, and done-when criteria.
   - You may read files, run searches, and take notes during this step.
   - Completion criterion: user has responded and ambiguities are resolved or explicitly accepted.

3. **Wait for green light.**
   - Do not proceed to edits, writes, or destructive commands on core task files.
   - Completion criterion: user gives an explicit start instruction.

4. **Begin work.**
   - Only now run edits, writes, or state-changing commands on the task's core files.
   - Completion criterion: first intended state-changing action is started.
