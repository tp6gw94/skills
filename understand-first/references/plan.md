# Plan phase

## Purpose
Turn the current specification into ordered, traceable thin slices.
Make dependencies, outputs, verification, and boundaries visible before build work.

## Inputs
- The current spec and its acceptance behavior, when supplied.
- Relevant code, constraints, requirements, and existing evidence.
- Missing earlier phases are acceptable; record assumptions and unresolved blockers.

## Deliverable
Record concise cards in the current phase source and same-page workbook HTML:
- Map each slice to specific spec behavior or acceptance.
- Order slices by real dependencies, not presentation order.
- Name the output and the evidence or verification each slice produces.
- Mark the boundary of each slice and any handoff or dependency.
Keep the plan thin and traceable. State decision, evidence, and unknowns. Use no fixed task count, estimate, or ceremony. This reference is guidance, not a standalone document or generated checklist.

## Completion
The reader can follow the order and see every stated behavior covered or flagged.
Dependencies, outputs, verification, boundaries, and unresolved unknowns are explicit.
Progress still needs explicit chat approval; a plan does not authorize implementation.

## Boundary
Do not hide missing requirements behind invented dependencies or precision.
Ask only about blockers. Avoid full-repository reads and multiagent gates when the work does not need them.
