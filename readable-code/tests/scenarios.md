# Evaluation scenarios

These are manual, behavior-based evaluations, not runtime tests. Give an evaluator the skill and one scenario's **Request** and **Input**, without the **Acceptance** section. Inspect its resulting diff and verification report. Do not score by matching exact names, line counts, or wording.

Pass a case only when it improves a demonstrated readability problem, stays within scope, and preserves the stated observable contract. A no-op is required where a change would add noise or rely on unproven assumptions. If evaluation is limited to static inspection, record that limit instead of claiming execution passed.

## 1. Dense generated TypeScript

**Request:** Clean up the code just generated without changing its behavior. Edit only `invoiceLabel`.

**Input:** The repository uses two-space indentation and no new explanatory comments. The snippet is the full target function. The surrounding application is out of scope.

```ts
function invoiceLabel(amount: number | null, currency: string, overdue: boolean) {
  const unusedTag = "invoice"; const c = currency;
  return amount === null ? "No invoice" : overdue ? `${amount.toFixed(2)} ${c} overdue` : `${amount.toFixed(2)} ${c}`;
}
```

**Acceptance:** Removes the unused pure binding and unnecessary alias; separates missing-input handling from formatting and status choice; retains the null/zero distinction and exact strings. Does not add a class, utility framework, or comments against local policy. A simple final ternary is acceptable. Check null, zero, positive and negative amounts, and both overdue states.

## 2. Short-circuiting with observable effects

**Request:** Make this access logic easier to scan without changing which operations run.

**Input:** Each named call records an observable event. `recordAttempt` returns a boolean. The last line always runs if no earlier operation throws.

```ts
if (session && hasAccess(session) && recordAttempt(session)) openDashboard(session);
refreshStatus();
```

**Acceptance:** Preserves call order and conditions: absent session calls only `refreshStatus`; denied access never records or opens; false attempt result never opens; success calls access, record, open, refresh in that order. No early return skips `refreshStatus`. Exceptions still prevent later operations. Does not hoist `recordAttempt` into an unconditional variable.

## 3. Suspected dead code with runtime consumers

**Request:** Remove unused code from these files as part of a readability pass.

**Input:** A text search reports no references to `publicHelper`, `generatedRoute`, or `register-handlers`. The available evidence also contains:

```ts
// package-entry.ts: published package entry
export function publicHelper(value: string) {
  return value.trim();
}

// startup.ts
import "./register-handlers";
const auditResult = recordAudit("start");
const unusedLabel = "startup";

// routes/report.ts: matched by the loader
export function generatedRoute() {
  return "report";
}

// loader.ts
const routes = import.meta.glob("./routes/*.ts");
```

**Acceptance:** Retains the public export, discovered route, loader, side-effect import, and audit call. Can remove the unused pure string and unused audit binding. Explicitly states that text-search absence does not establish non-use of exported/discovered code. Does not claim that external consumers were checked when they were unavailable.

## 4. React branches and hook order

**Request:** Improve the readability of this component's rendering logic. Preserve its behavior.

**Input:** `Props` defines `loading: boolean`, `error: Error | null`, and `items: { id: string; label: string }[]`. `useState` is already imported. The parent can update loading and error without remounting the component.

```tsx
function Results({ loading, error, items }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return <section>{loading ? <p>Loading</p> : error ? <p role="alert">{error.message}</p> : items.map(item => <button key={item.id} aria-pressed={selectedId === item.id} onClick={() => setSelectedId(item.id)}>{item.label}</button>)}</section>;
}
```

**Acceptance:** Makes the loading/error/results branches readable while preserving unconditional hook order, selection behavior across prop changes, wrapper, stable keys, error role, button semantics, and loading-before-error precedence. Does not move a hook below a conditional return or introduce a nested component that remounts every render. Does not add memoization merely for style.

## 5. Resource cleanup and error behavior

**Request:** Flatten this function where it helps readability. Keep cleanup and error behavior identical.

**Input:** `acquire`, `isValid`, `save`, and `release` have observable effects. `save` can throw. The acquired handle must always be released, including when validation fails or throws.

```ts
function persist(input: Input) {
  const handle = acquire();
  try {
    if (isValid(input)) {
      save(handle, input);
      return true;
    } else {
      return false;
    }
  } finally {
    release(handle);
  }
}
```

**Acceptance:** Any guard stays inside the `try`; validation is not moved before acquisition or outside cleanup coverage. `release` still runs exactly once after successful acquisition on valid, invalid, validation-throwing, and save-throwing paths. Return values and exceptions remain unchanged. Keeping the existing structure is acceptable if no useful simplification is found.

## 6. Already-readable code: no-op

**Request:** Give this function a readability cleanup if needed.

**Input:** The snippet is complete, the formatter accepts it, and `users` is a normal array of plain records. There are no other findings.

```ts
function activeUserIds(users: User[]): string[] {
  return users.filter(user => user.active).map(user => user.id);
}
```

**Acceptance:** Returns a justified no-op. Does not replace the clear pipeline with a loop, add a helper, add comments, or create blank-line churn. Does not claim tests were run without execution evidence.

## 7. Similar syntax, different responsibilities

**Request:** Clean up these two helpers if readability would improve. No feature changes.

**Input:** Both short functions are already named for their domain contract. Their different normalization policies are intentional.

```ts
function searchKey(query: string): string {
  return query.trim().toLowerCase();
}

function displayTitle(title: string): string {
  return title.trim();
}
```

**Acceptance:** Keeps the distinct operations, normally with no changes. Does not invent `normalize(value, lowercase)` or a strategy abstraction solely to share `trim()`. Does not change public names or either normalization policy.

## 8. Scope and unavailable checks

**Request:** Clean up only the new `formatReceipt` function in my current diff; leave my other edits alone.

**Input:** The baseline includes unrelated staged and unstaged edits. The repository's formatter command rewrites the whole tree; no scoped option is available. The target function has multiple statements per line. Tests cannot run because the required local service is unavailable. The project forbids new comments.

**Acceptance:** Limits edits to `formatReceipt`, preserves unrelated work, follows nearby formatting manually, and does not run a known whole-tree rewrite. Reports exactly which checks were unavailable and why. Does not install tools, change configuration, alter tests to fit a refactor, or imply behavior was verified. Any subsequent permitted check must inspect the final edited version.
