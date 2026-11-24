---
name: ownership-check
description: Check understanding through an interactive quiz using randomly sampled real code excerpts and architecture relationships.
disable-model-invocation: true
---

# Ownership check

Help the user demonstrate that they understand the work well enough to explain its behavior and consequences. Conduct the quiz directly in chat, in the user's language. File output requires an explicit request; this is not a merge gate or permission to change the work.

## 1. Scope and sample

Use the user's named change, code area, or architecture. Otherwise use the current task's latest work. If no concrete material is available, ask for a target or excerpt before generating questions.

Default to three questions per round unless the user specifies a count. Inspect the relevant source and direct dependencies needed to understand it, then build a bounded pool of real code excerpts and verified architecture relationships. Treat supplied excerpts as a limited scope; expand only when a question depends on missing context.

Sample without replacement using tool-backed randomness. When both code and architecture candidates are available and the round has at least two questions, randomly select at least one of each, then sample the remaining slots from the remaining pool. Report a selection as random only after using a randomness tool; otherwise state that it is non-random. When the pool is smaller than the requested count, use the available candidates and state the reduced count.

Before asking each question, establish a source-grounded assessment criterion. Ask only about behavior, relationships, or tradeoffs the inspected material supports. Keep intended requirements distinct from observed implementation; historical motives require recorded evidence.

Completion: the round has a stated scope and count, sampled targets, and answerable questions grounded in inspected material.

## 2. Ask one question and wait

Briefly announce the scope and count, tell the user how to request the next question in their language, then present only the first question.

For a code question, quote the smallest sufficient real excerpt with its source location and necessary surrounding context. For an architecture question, name the relevant components and source locations that establish their relationship. Use supplied labels when file paths are unavailable.

Test understanding through a concrete task, such as:

- Predicting an observable result for a particular input or failure.
- Tracing data, control, or responsibility across a component boundary.
- Explaining an invariant or the consequence of changing an operation's order.
- Identifying what would need to change under a new requirement, and the tradeoff involved.

Prefer explanation and prediction over syntax trivia or reciting names. Accept an open-book answer in the user's own words. Keep expected answers, answer-bearing explanations, and future questions out of the question turn so the user's answer supplies the evidence of understanding.

Completion: one source-grounded question has been asked. End the turn and wait for the user's answer.

## 3. Assess, then wait for an explicit request to advance

Assess the answer against the source-grounded criterion, accepting technically sound alternatives and explicitly stated assumptions. Use three outcomes: demonstrated, partial, or not yet demonstrated. State briefly what the answer got right and which consequential gap remains; praise alone is not an assessment.

For a partial or incorrect answer, ask at most one focused follow-up on the current question before explaining the missing behavior. Keep that follow-up free of the answer. If the user says they do not know, requests the answer, or explicitly asks to move on, omit the follow-up. Ground any correction in the actual source. Distinguish understanding demonstrated independently from material explained with help. If the evidence is ambiguous or the question is flawed, withdraw or repair it rather than marking the user wrong.

With questions still remaining in the round, present exactly one next sampled question only when the current user message explicitly asks for it (for example, “next question” or an equivalent in the user's language). If the message also includes an answer, assess it first. If the user skips an unanswered question, record it as unresolved. End the turn and wait for the next answer. Without an explicit request to advance, stay on the current question and end the turn after any feedback, explanation, or focused follow-up. An answer, a request for an explanation, or an acknowledgment is not a request to advance.

Completion: the current question has an assessment or an explicit unresolved status, or is awaiting its focused follow-up. If questions remain, the next one has been shown only on an explicit request.

## 4. Close the round

After the requested questions, or when the user stops, summarize demonstrated understanding, remaining gaps, and topics explained with help. Attach source pointers to gaps that need revisiting.

Limit conclusions to the sampled material: passing a few questions does not establish understanding of the whole system, production readiness, or permission to merge. Finish with the chat summary. Revisit a missed concept with a new scenario only when the user requests another round.

Completion: the user knows what they demonstrated, what remains untested, and where to rebuild understanding.
