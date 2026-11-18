# OCR code review

Use this parent-only procedure for [Todd mode's final review gate](../SKILL.md#runtime-operations-and-verification). Read `~/.agents/skills/open-code-review/SKILL.md` fully before running OCR. That skill owns CLI usage, output handling, and troubleshooting; this reference supplies Todd's scope and acceptance criteria. Read `ocr reviewers` in `~/.agents/todd-models.md` for the comma-separated list of OCR `provider/model` pairs. Use the OCR provider aliases and model IDs as written; Pi reasoning suffixes and subagent fallbacks do not apply. Run exactly one review per listed pair per target. One entry means one reviewer, with no second reviewer added. A missing or empty list blocks the gate; report it rather than using the CLI default.

## Review

1. Identify the complete task diff from its base revision through the final working tree, including committed, staged, unstaged, and untracked task changes. Select workspace, commit, or range targets under the skill's scoping rules. Combine runs when one target cannot cover both committed and uncommitted changes. Preserve unrelated user work and keep fixes within the agreed task ownership.
2. Supply the agreed requirements, scope boundaries, constraints, observable acceptance criteria, and relevant verification evidence through `--background`. When tests change, read [Todd's testing policy](../SKILL.md#testing-policy) and its referenced skill, then include the observable test contracts and applicable test-quality criteria in the background itself, not merely a local skill path.
3. For each target, run `ocr review` in the project repository with explicit `--provider` and `--model` for each configured reviewer. Give all reviewers the same unchanged diff and background, and keep their reviews independent. Use `--audience agent` and a distinct `--output` path outside the repository for each reviewer and target.
4. Read each complete result and inspect its stderr. Check the skill's success criteria and confirm every task-changed file was reviewed by every configured reviewer across the targets. A failed run or skipped in-scope file leaves the gate incomplete even if another reviewer succeeded. Follow the skill's troubleshooting for that reviewer; report missing coverage instead of substituting a model.

## Findings and acceptance

After the review runs finish, merge findings by underlying issue and keep the reporting models for each. The parent checks each distinct finding against the final code and agreed requirements. Use evidence rather than reviewer votes: agreement is not proof, and a finding from one reviewer can still require a fix. Record a disposition and reason for every distinct finding:

- **Fix:** Confirmed critical, high, or medium issue.
- **No fix:** False positive or behavior that matches the agreed requirements; cite the evidence.
- **Defer:** Confirmed low-priority issue or optional improvement; state why it can wait.
- **Needs evidence:** The claim cannot be confirmed or dismissed yet; report what is missing rather than applying the suggestion.

Existing implementation authorization covers safe, in-scope repairs through the matching pstack playbook. A review-only request still requires permission before fixes. After repairs, rerun applicable verification and review the repaired final diff with every configured reviewer. Scope-changing or unsafe fixes return to the parent for alignment rather than expanding the task silently.

The gate passes when every configured reviewer has covered the full final task diff, applicable verification passes for that code, and no confirmed critical, high, or medium finding remains unresolved. Report reviewers and targets, findings and their dispositions, verification evidence, and any incomplete coverage. The parent owns final acceptance. Passing review grants no commit or PR authorization; the skill's user verification before committing review fixes still applies.
