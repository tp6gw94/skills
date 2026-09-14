# Spec phase

## Purpose
Turn the available problem and requirements into observable behavior.
Give implementation and review a shared boundary without prescribing a recipe.

## Inputs
- The current idea material when supplied, plus requirements and constraints.
- Existing behavior, relevant code, and evidence that are actually available.
- Missing earlier phases are acceptable; label assumptions instead of filling gaps.

## Deliverable
Record concise cards in the current phase source and same-page workbook HTML:
- **Observable behavior:** actor, input or state, response, and outcome.
- **Scenarios:** representative success, failure, and state-transition cases.
- **Edge cases:** boundaries and expected behavior where evidence supports it.
- **Non-goals:** behavior deliberately outside this change.
- **Acceptance:** checks a reader can observe and reproduce.
Tie each acceptance point to behavior or a stated decision. Keep decision, evidence, and unknowns explicit. This reference is guidance, not a standalone document or generated checklist.

## Completion
The reader knows what must happen, for which scenarios, and what counts as accepted.
Edges, non-goals, evidence, and unresolved unknowns are visible rather than implied.
Progress still needs explicit chat approval; a written spec is not approval.

## Boundary
Do not turn acceptance into an implementation plan or invent requirements.
Ask only about blockers. Avoid full-repository reads or a full test suite for every wording change.
