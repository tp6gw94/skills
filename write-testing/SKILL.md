---
name: write-testing
description: Write or revise tests. Test observable outcomes and public contracts, especially when choosing assertions, mocks, or tests that must survive refactoring.
---

# Outcome testing

Test the outcome: what a caller or user can observe. Internal structure may change; the contract should not.

1. Identify the contract: inputs, observable result, side effect, or error.
   - Completion: state the expected outcome without referring to internal functions, calls, or state.

2. Exercise the public interface and assert that outcome.
   - Test returned values, visible state, persisted data, emitted events, or errors as the contract requires.
   - Mock only external boundaries such as network, database, clock, or third-party services.
   - Assert an interaction only when that interaction is itself the contract.
   - Completion: the test fails when the contract changes and passes after an equivalent refactor.

3. If a test depends on private methods, call counts, call order, or internal state, rewrite it around the observable contract.
   - Completion: an implementation change that preserves the outcome does not require changing the test.
