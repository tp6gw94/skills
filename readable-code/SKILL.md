---
name: readable-code
description: Improve the readability of newly generated or existing code without changing behavior. Use after code generation or when asked to clean up dense logic, remove unnecessary code, separate logical sections, or simplify hard-to-read expressions.
---

# Readable code

Make the requested code easy to scan and understand: remove proven waste, expose the control flow, and separate distinct logical steps. Optimize for comprehension, not the fewest lines or the largest diff.

## Establish the boundary

- Work on the requested files or diff. If the request only says to clean up the code just written, use that change as the boundary. Preserve unrelated work; do not expand into a repository-wide rewrite.
- Read applicable project instructions, surrounding code, and existing formatter, linter, and test configuration. Follow the project's idioms and comments policy without adding tooling, changing configuration, or suppressing checks.
- Identify observable behavior before editing: inputs, outputs, errors, public contracts, state changes, and side effects. Keep a baseline that includes existing uncommitted work.
- Leave already-clear code alone. A justified no-op is a valid result.

## Remove only proven waste

- Remove unused local bindings with pure initializers, unreachable code established by the current contract, stale commented-out implementations, and redundant scaffolding when the evidence supports removal.
- Search callers and relevant entry points before deleting symbols or files. No textual matches is not proof of non-use: exports, dynamic imports, reflection, framework discovery, configuration, and external consumers may keep code live.
- An unused value does not make its computation unnecessary. Preserve initializer calls, getters, module-loading effects, logging, cleanup, and other observable work unless their removal is explicitly in scope.
- Keep compatibility branches, validation, and error handling unless evidence proves them obsolete. When uncertain, retain the code and explain the specific uncertainty rather than guessing.

## Make the logic visible

- Use one statement per line. Within a function, keep related statements together and put one blank line between distinct steps, such as validation, preparation, computation, and the final effect or return. Do not put a blank line after every statement or force all functions into the same sections.
- Replace opaque abbreviations and generic temporary names with names that explain their role. Keep familiar short names where the meaning is clear; avoid renaming public interfaces for style alone.
- Unpack nested ternaries, mixed boolean expressions, or dense transformation chains when a reader must mentally execute them to understand the result. Prefer straightforward `if`/`else`, `switch`, guard clauses, or a few named intermediate values.
- Keep concise expressions that are already clear: a simple ternary, nullish default, or short `map`/`filter` pipeline may be the most readable form. Do not mechanically expand every expression into a loop.
- Before extracting arguments or splitting an expression, trace its original evaluation order step by step, including getters, implicit type conversions, and method receiver lookup and binding. If that order cannot be preserved, keep the expression intact and improve only its formatting.
- Preserve evaluation order, short-circuiting, receiver bindings, mutation, async sequencing, and error/cleanup behavior. Keep previously conditional work conditional; do not precompute an effectful predicate merely to name it. Preserve distinctions such as `0` versus missing values.
- Flatten nesting when it reveals the main path, but do not move work across cleanup, transaction, lock, or resource-lifetime boundaries. In React, preserve hook order, component identity, keys, and render/effect behavior.

## Extract only a real responsibility

- Keep a short cohesive operation together. Extract a helper when it names a meaningful responsibility, isolates a substantial branch, or removes duplication with the same semantics.
- Prefer explicit inputs and outputs. Avoid helpers that merely wrap one obvious expression, require a long parameter list, or make the reader jump around to follow one simple operation.
- Do not introduce abstractions, design patterns, new dependencies, or speculative reuse just to make the original function shorter. Do not collapse distinct domain behavior into a generic helper because the syntax looks similar.
- Prefer clear structure and naming over comments that narrate the code. Preserve useful explanations of intent, constraints, or surprising behavior, as well as required notices and tooling directives. Follow local rules on adding comments.

## Verify the final change

1. Review the actual diff against the baseline. Check that every edit improves readability within scope and preserves the original contract; remove unrelated formatting churn.
2. Use existing formatting and lint checks on affected code when they can be safely scoped. Run applicable tests and type/build checks for the final revision. Test observable outcomes and edge cases affected by the refactor, rather than the new helper structure.
3. If a check fails, distinguish existing failures from regressions and repair only safe in-scope issues. If verification is unavailable, say exactly what was not run; do not label the refactor behavior-verified.
4. Report the meaningful simplifications, evidence for non-obvious deletions, and exact checks/results. Mention uncertain code intentionally retained. For a no-op, state what was inspected and why no change helped.

Read [examples](references/examples.md) when deciding between a useful simplification and an unsafe or cosmetic rewrite. Use [evaluation scenarios](tests/scenarios.md) to evaluate the skill; they are not a checklist to run on every project.
