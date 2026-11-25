---
name: decision-audit
description: See what the agent chose without you specifying or approving it.
disable-model-invocation: true
---

# Decision audit

Audit the choices the agent made on the user's behalf. This is read-only; apply changes only if the user separately asks.

## 1. Compare the request with the result

Use the named target, or the current task's latest plan or result. Read the user's instructions, applicable project rules, and the relevant plan, diff, config, or tool calls. Compare against the state before the task when available. Mark plan-only choices as proposed.

Start with concrete behavior: timeouts, retries, limits, fallbacks, permissions, and retention. For each changed setting, inspect its name, exact value, default, and behavior when unset. Treat these as separate choices when the user could keep one and change another: approving a configurable database path does not approve the environment variable name or the fallback path. Check tool arguments as well as files. Include scope and acceptance choices when they change what was delivered or counted as done. Skip implementation details whose alternatives would not affect the user, an operator, or verification.

Completion: each candidate names a concrete setting or policy and points to the available evidence.

## 2. Attribute each choice

- **Requested, approved, or required:** Exclude choices specified or accepted by the user, or fixed by an applicable rule. Disclosure, delegation, and silence do not establish approval of a specific value.
- **Agent-selected:** Include choices the agent introduced, overrode, or explicitly decided to retain when alternatives were available. Include an explicit pin even if it matches an inherited default: the new pin prevents future default changes from taking effect.
- **Inherited:** Leave existing settings and untouched dependency defaults out of the findings. If an inherited value explains the effect of a new agent choice, cite the source and label it as inherited. An omitted parameter alone does not establish a default.
- **Unverified:** If a concrete candidate matters but its value or authorship cannot be established, put it in a separate section with the missing evidence. Do not present it as an agent choice.

Completion: every candidate has been classified, and duplicate effects of a single choice are merged.

## 3. Show the findings together

In the user's language, name the audited scope in one line. Then list the findings in the same reply, ordered by concrete impact. For each finding, state the choice and exact value or policy, cite where the agent introduced or selected it, and explain its practical effect. Group choices that share the same evidence and effect in one bullet, but name each choice explicitly. Distinguish configured behavior from observed runtime behavior. Include a rationale only if it was recorded.

Example: **Request timeout · 30 seconds** (`client.ts:42`) — The agent added this limit; the request did not specify one. A call that has not completed by then is aborted.

If no choices are established, say so for the inspected scope without recapping excluded choices. After the findings, note only gaps that could change the attribution or practical effect of a concrete candidate. An unchecked detail is not itself a candidate. Use one-at-a-time review only if the user asks for it; otherwise end with the findings, not a question or a recommendation for every item.

Completion: the user can see all confirmed choices and any material evidence gaps without answering a follow-up question.
