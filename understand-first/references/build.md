# Build phase

## Purpose
Implement the approved scope and produce evidence that its behavior was checked.
Carry the work through verification instead of stopping at a first draft.

## Inputs
- The current plan and spec, approved decisions, and relevant source.
- Existing constraints, supplied requirements, and available test or runtime evidence.
- Missing earlier phases are acceptable; mark assumptions and ask only blockers.

## Deliverable
Record concise cards in the current phase source and same-page workbook HTML:
- Actual implementation and the behavior it changes.
- Focused tests or checks appropriate to that behavior, with commands and results.
- Deviations, assumptions, unknowns, and any effect on approved scope.
Continue through verification and report evidence, not intention. Keep decision, evidence, and unknowns explicit. This reference is guidance, not a standalone document or generated checklist.

## Completion
The implementation is present, focused verification has evidence, and deviations are explained.
The reader can decide whether the approved behavior is evidenced and what remains unknown.
A behavior or scope change triggers review of affected decisions; it does not restart the full workflow.
Progress still needs explicit chat approval; a build result does not approve the project.

## Boundary
Stay within approved scope. Do not add a feature, force a full test suite for every typo, or require a multiagent gate.
