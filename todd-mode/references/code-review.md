# OCR code review

Use this parent-only procedure for [Todd mode's final review gate](../SKILL.md#runtime-operations-and-verification). Read `~/.agents/skills/open-code-review/SKILL.md` fully before running OCR. That skill owns CLI usage, output handling, and troubleshooting; this reference supplies Todd's scope and acceptance criteria. OCR uses its own provider and model configuration, not the subagent roles or fallbacks in `~/.agents/todd-models.md`.

## Review

1. Identify the complete task diff from its base revision through the final working tree, including committed, staged, unstaged, and untracked task changes. Select workspace, commit, or range targets under the skill's scoping rules. Combine runs when one target cannot cover both committed and uncommitted changes. Preserve unrelated user work and keep fixes within the agreed task ownership.
2. Supply the agreed requirements, scope boundaries, constraints, observable acceptance criteria, and relevant verification evidence through `--background`. When tests change, read [Todd's testing policy](../SKILL.md#testing-policy) and its referenced skill, then include the observable test contracts and applicable test-quality criteria in the background itself, not merely a local skill path.
3. Run the skill's review command in the project repository with `--audience agent` and `--output` to a task-specific path outside the repository. Read the complete result file and inspect stderr warnings. Follow the skill's troubleshooting on failure rather than retrying blindly or substituting another review workflow.
4. Check the skill's success criteria and coverage of every task-changed file. Failed or skipped in-scope files leave the gate incomplete, even when OCR exits successfully or reports no findings elsewhere.

## Findings and acceptance

The parent checks findings against the final code and agreed intent. Resolve confirmed critical, high, and medium findings; document the evidence for dismissing false positives. Report genuine remaining low findings without treating nitpicks as required changes.

Existing implementation authorization covers safe, in-scope repairs through the matching pstack playbook. A review-only request still requires permission before fixes. After repairs, rerun applicable verification and OCR review against the repaired final diff. Scope-changing or unsafe fixes return to the parent for alignment rather than expanding the task silently.

The gate passes when OCR has completed review of the full final task diff, applicable verification passes for that code, and no confirmed critical, high, or medium finding remains unresolved. Report reviewed targets, findings and their dispositions, verification evidence, and any incomplete coverage. The parent owns final acceptance. Passing review grants no commit or PR authorization; the skill's user verification before committing review fixes still applies.
