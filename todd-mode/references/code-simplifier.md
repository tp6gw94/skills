# Code-simplifier work contract

Directly simplify owned changed code for clarity, maintainability, and readability while preserving behavior. This is an editing task, not a review-only task. Read this file and all supplied applicable instruction files fully before work, and discover narrower project instructions within owned paths. Return work to the parent without orchestrating another simplification phase or delegating a replacement.

## Scope

Use the handoff's exclusive owned files or hunks and approved nearby scope. Preserve unrelated user changes, public contracts, behavior, receiver bindings, evaluation order, short-circuiting, and side effects. Broader refactors, new dependencies, and tooling changes are outside this task. Missing instructions or ambiguous ownership are blockers. Make no commits or PRs.

## Lint and format first

Inspect existing scripts and linter/formatter configuration. Run configured lint/format operations on owned code and apply safe existing fixes before manual simplification. Inspect their diff and preserve the ownership boundary. If scripts cannot be safely scoped, report that limitation rather than formatting unrelated code.

Use existing tools and configuration without changing exclusions or suppressing failures. Report absent lint/format honestly; absence is not a passed check. Resolve safe in-scope failures or report the blocker.

## Simplify

Edit remaining clarity issues using these rules:

- Write code for clarity first. Prefer readable, maintainable solutions with clear names and straightforward control flow. Avoid code-golf and overly clever one-liners unless explicitly requested.
- Use one statement per line and no nested ternaries.
- Split long boolean conditions and call chains into named intermediate variables while preserving short-circuiting, receiver bindings, evaluation order, and side effects. Keep previously conditional work conditional.
- Inside functions, separate logical steps with one blank line. Match surrounding style and obey the configured formatter; report any conflict rather than altering configuration.
- Keep nesting at three levels or fewer inside functions using guard clauses. Count nested control-flow blocks, excluding the function/class wrapper, and preserve cleanup behavior. Prefer direct control flow over abstractions created solely to meet this limit.
- Use self-describing code without new comments.

Account for every owned file. A justified no-op is valid when all owned code is already clear and compliant. If a rule cannot be met safely within scope, identify the conflict instead of changing behavior or hiding it.

## Verify and return

Rerun applicable lint/format checks and the original tests, typecheck, build, and runtime acceptance from the handoff after edits. Perform assigned reviews supported by your tools and provide the diff and evidence for remaining parent-arranged reviews. Repair safe in-scope failures and verify again; otherwise stop and identify your edits for reconciliation. Failed or unavailable checks are not success.

Return a concise result with:

- Applicable instructions and every owned file accounted for.
- Changed files and reasons, or a justified no-op, with the actual diff or evidence path.
- Exact verification commands, outcomes, expected versus observed acceptance, and evidence paths.
- Failures, blockers, and untested cases, including unavailable checks.
- Actual model and reasoning from available runtime settings; report unknown values honestly.

Keep full logs in the authorized evidence location. The parent owns final acceptance.
