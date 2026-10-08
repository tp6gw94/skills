# Code simplification

Use this parent-only procedure when [Todd mode's code-simplification gate](../SKILL.md#runtime-operations-and-verification) fires. This supplements the matching pstack playbook.

## Dispatch

1. Read `/Users/todd/.pi/agent/extensions/rpc-subagents/skills/rpc-subagents/SKILL.md` fully and discover the needed tools and schemas. Resolve Model routing below. Missing capabilities or invalid settings block dispatch.
2. Stop overlapping writers. Define exclusive ownership of task-changed code, including any approved nearby scope, and identify unrelated user changes to preserve. Record the base revision, complete task diff, and current owned-file contents, including staged, unstaged, and untracked implementation. This is the pre-simplification baseline, not merely HEAD.
3. Verify absolute instruction and evidence paths, then compose the Fresh handoff below. Give the child [its work contract](code-simplifier.md) as a source pointer to read fully; the parent loads that file only when needed to resolve an acceptance gap.
4. Launch a new `code-simplifier` through `rpc_subagents` with `context: "fresh"`, the project cwd, resolved model and reasoning, suitable editing/verification tools, and a bounded deadline. Never use fork or session reuse, including on retries. Capabilities and routing belong in launch arguments, not task prose. Follow RPC operating instructions for dispatch and retain the task ID.
5. Wait for terminal completion and inspect the full structured result and evidence under the RPC acceptance rules. Check actual model/reasoning against launch settings. Only `completed` with sufficient evidence proceeds to Parent acceptance. Keep overlapping writers stopped until the child is terminal and its changes are accounted for.

### Fresh handoff

Supply these task-specific fields without copying the child's rules:

- Agreed functional request, constraints, and observable acceptance criteria.
- Project cwd, exclusive owned files or hunks, approved nearby scope, and unrelated user changes to preserve.
- Pre-simplification baseline and complete task diff, with evidence paths covering uncommitted and new files.
- Previously passing checks, exact commands/outcomes/evidence, required post-edit reviews, and runtime acceptance operations.
- Absolute verified pointers to `code-simplifier.md`, applicable project instructions, and required operating skills or principle leaves. Require full reading before work; skills and extensions are not inherited. Include any Todd-specific constraints needed to perform the task.
- Authorized evidence location, available verification capabilities, and deadline.

## Model routing

Read the `code-simplifier` role in `~/.agents/pstack-models.md`, the shared settings file for all roles. Use the same model, reasoning-budget, and fallback conventions as existing pstack roles. A missing file or role defaults to the parent's model and reasoning.

- `code-simplifier: inherit-parent` or `code-simplifier: auto` inherits the parent's model and reasoning; omit both launch arguments.
- An explicit `provider/id:effort` value becomes RPC `model: { provider, id }` and separate `thinking`. The provider ends at the first slash; the final effort suffix is reasoning, not part of the exact registry ID. Without an explicit effort, apply the file's reasoning budget when specified, otherwise inherit parent reasoning.
- Verify the exact model ID and reasoning against the registry, discovered RPC schema, and selected model's supported levels. Empty, malformed, duplicate role settings or unsupported reasoning values block dispatch rather than silently overriding settings. Handle model unavailability under the fallback policy below.

Apply only an applicable fallback line from the same file for model unavailability allowed by its policy, including for an inherited primary model. Match the effective provider, ID, and reasoning. Translate the fallback endpoint using the same RPC mapping, verify its availability and supported reasoning, and report the switch.

Task, tool, test, or runtime-metadata failures are not fallback reasons. An unmatched or unsupported fallback is a blocker; preserve reasoning rather than silently lowering it. Each fallback retry uses a fresh child after reconciling the stopped child's partial edits and updating its handoff.

## Parent acceptance

Inspect the actual simplification diff against the recorded baseline and the complete task diff against agreed acceptance. Account for every changed file, preserved user work, behavior, public contracts, evaluation order, and side effects. Reject scope escapes and unrelated formatter churn.

Require post-edit lint/format checks and the original applicable tests, typecheck, build, and runtime acceptance. Inspect exact outcomes and evidence, arrange the required pstack reviews on the final diff, and re-verify subsequent repairs. Earlier verification never proves edited final code. A no-op needs all owned files accounted for and applicable checks, not merely a claim that nothing changed.

The parent owns final acceptance. Resolve every failure or evidence gap before declaring success. If safe repair is impossible, undo only simplifier-owned edits against the baseline, preserve other work, re-verify the restored code, and report the failed phase. A rollback is not successful simplification. This phase authorizes neither commits nor PRs by the child.
