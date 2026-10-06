# Delegate ego-browser through Pi RPC

Use this adapter only when the execution route in [the main skill](../SKILL.md#choose-the-execution-route) selects Pi RPC. The coordinating agent runs these steps. An assigned browser executor follows its supplied instructions directly.

## Check dependencies and policy

Read `$HOME/.pi/agent/extensions/rpc-subagents/skills/rpc-subagents/SKILL.md` before dispatch. For missing capabilities or provider startup limits, read its linked `../../README.md`. Resolve those paths relative to that RPC skill, not this adapter.

Discover RPC tools through codemode before composing calls:

```js
text(await searchTools("rpc_subagents", { namespace: "rpc_subagents" }));
text(await describeTool("rpc_subagents_run"));
```

Describe each additional RPC tool before using it. Confirm that the parent can access codemode and the required RPC tools. Confirm that the child has the model and capabilities required by the task contract. Stop and report unavailable requirements rather than substituting an executor or model.

Unless explicit session, user, or project settings override them, use these defaults:

- Model `opencode-go/muse-spark-1.3-contributor` or `openai-codex/gpt-6-luna`.
- Reasoning `high`.
- Context `fresh`.
- Asynchronous execution.

Apply explicit model, reasoning, context, and execution overrides before dispatch. An explicit `context: "fork"` uses the current branch snapshot at invocation instead of fresh context. It does not receive later conversation updates. Require the child to confirm its selected model and supported reasoning level. Treat a mismatch as a blocker.

## Build and dispatch the prompt

Fill the task contract from the main skill. Include its complete executor guidance and any task-specific details from `$HOME/.local/share/ego/ego-skills/SKILL.md`. Children do not automatically load skills. Keep the shared browser instructions in the main skill as the single source of truth.

In the example below, bind `taskContract` to the filled contract, `browserInstructions` to the main skill's complete executor guidance, and `vendorDetails` to the additional API instructions the task needs. Use an empty string for `vendorDetails` when no additions are needed. Replace the example settings with any explicit overrides, and align `timeoutMs` with the contract's deadline.

```js
const task = await tools.rpc_subagents_run({
	name: "Operate ego-browser",
	model: { provider: "opencode-go", id: "muse-spark-1.3-contributor" },
	thinking: "high",
	context: "fresh",
	async: true,
	timeoutMs: 600000,
	tools: ["read", "bash", "write", "codemode"],
	webAccess: false,
	prompt: [
		browserInstructions,
		taskContract,
		vendorDetails,
		"Confirm the selected model and supported reasoning level before browser operations. Stop and report any mismatch with the requested settings."
	].join("\n\n")
});
store("egoBrowserTaskId", task.taskId);
text(task);
```

The explicit tool list replaces the RPC execution defaults. `read` supports documentation and evidence inspection, including images. `bash` runs browser scripts, and `write` supports permitted output files. `codemode` supports tool orchestration, not further delegation. Keep `webAccess: false` because this task operates ego-browser.

Record the task ID immediately. A queued or accepted dispatch does not prove startup or completion.

## Observe and resume the executor

Use `rpc_subagents_status({ taskId })` to inspect state, `rpc_subagents_wait({ taskId, timeoutMs })` for a bounded wait, and `rpc_subagents_result({ taskId })` for retained results. A wait timeout does not cancel the task. Report still-running work with its task ID and next observation action.

For pending dialogs or child questions, follow the RPC skill's linked `references/operations.md`. Respond only within the user's authorization. A child request is not approval authority.

For follow-up work after a managed session completes, pass its reported session ID or absolute managed `.jsonl` path as `session`. Keep the same working directory and model, with one exclusive writer. Omit `context` because `session` and `context` are mutually exclusive. Record the new task ID. Supply the follow-up contract and apply the main skill's follow-up TaskSpace rules. Continuing an RPC session does not reopen a finished TaskSpace.

## Accept the result or report the blocker

Accept only `status === "completed"` as successful execution, then apply the main skill's evidence acceptance checks. Inspect `truncated`, `error`, `persistenceError`, and `state.cleanupError`. Retrieve the result or inspect the event log if retained text is incomplete. A completed task with empty text is not evidence that browser work occurred.

Report task IDs, terminal statuses, checked evidence, and unresolved blockers. For failed, cancelled, or interrupted tasks, report the actual error or reason. Do not present partial text or child reports as successful completion.

If the provider returns HTTP 400 stating that the Go model trains on request data, ask the user to review the workspace Privacy setting for paid endpoints that train on request data. Keep privacy settings unchanged unless the user explicitly authorizes that policy. Do not bypass the refusal with another model or provider.
