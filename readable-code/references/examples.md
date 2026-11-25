# Readability examples

These are decision examples, not a mandatory coding style. Follow the target project's formatter and language conventions. Preserve behavior even when a shorter version looks attractive.

## Separate steps without fragmenting the function

Both versions use this type:

```ts
type Invoice = {
  lines: { quantity: number; unitPrice: number }[];
  discount: number;
};
```

Before:

```ts
function total(invoice: Invoice | null): number {
  if (invoice) {
    const debugLabel = "invoice";
    const s = invoice.lines.reduce((n, l) => n + l.quantity * l.unitPrice, 0);
    const d = invoice.discount;
    return Math.max(0, s - d);
  } else {
    return 0;
  }
}
```

After:

```ts
function total(invoice: Invoice | null): number {
  if (!invoice) {
    return 0;
  }

  const subtotal = invoice.lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPrice,
    0,
  );
  const discount = invoice.discount;

  return Math.max(0, subtotal - discount);
}
```

The unused pure string binding is gone and intermediate values have meaningful names. Validation, calculation, and return are visually distinct. The cohesive reduction stays inline; no helper or explanatory comment is needed. The discount is still read after the subtotal is calculated and before looking up `Math.max`.

## Expose branches while preserving precedence

Before:

```ts
function statusLabel(loading: boolean, error: Error | null, count: number) {
  return loading ? "Loading" : error ? error.message : count === 0 ? "Empty" : `${count} items`;
}
```

After:

```ts
function statusLabel(loading: boolean, error: Error | null, count: number) {
  if (loading) {
    return "Loading";
  }

  if (error) {
    return error.message;
  }

  return count === 0 ? "Empty" : `${count} items`;
}
```

The priority remains loading, then error, then count. The simple final ternary is clear and does not need expansion.

## React: simplify rendering without moving hooks

Both versions use `Props = { loading: boolean; error: Error | null; users: { id: string; name: string }[] }` and the same existing `useMemo` import.

Before:

```tsx
function UserList({ loading, error, users }: Props) {
  const names = useMemo(() => users.map(user => user.name), [users]);
  return <section>{loading ? <p>Loading</p> : error ? <p role="alert">{error.message}</p> : <p>{names.join(", ")}</p>}</section>;
}
```

After:

```tsx
function UserList({ loading, error, users }: Props) {
  const names = useMemo(() => users.map(user => user.name), [users]);

  let content;
  if (loading) {
    content = <p>Loading</p>;
  } else if (error) {
    content = <p role="alert">{error.message}</p>;
  } else {
    content = <p>{names.join(", ")}</p>;
  }

  return <section>{content}</section>;
}
```

All hooks still run unconditionally in the same order, and the wrapper and rendering priority stay intact. Keep the short `map`; do not remove memoization or extract a new component solely to shorten this example. Use the project's existing explicit type for `content` if its style requires one.

## Do not make conditional work unconditional

Before:

```ts
if (session && hasAccess(session) && recordAttempt(session)) {
  openDashboard(session);
}
```

A safe expansion, if the original condition needs clarification:

```ts
if (session && hasAccess(session)) {
  const attemptRecorded = recordAttempt(session);
  if (attemptRecorded) {
    openDashboard(session);
  }
}
```

Do not move `recordAttempt(session)` above the first condition. It must not run for a missing or unauthorized session. A guard clause is also possible only when returning early would preserve the rest of the enclosing function.

## An unused binding can still contain required work

```ts
import "./register-handlers";

const auditResult = recordAudit(event);
return response;
```

If `auditResult` is never read, the assignment may become `recordAudit(event);`; the call remains. The side-effect import also remains. Similarly, a package export or a file found by a route glob cannot be deleted just because ordinary references are absent.

## Leave clear code alone

```ts
const displayName = user.name ?? "Anonymous";
const buttonLabel = saving ? "Saving…" : "Save";
const activeIds = users.filter(user => user.active).map(user => user.id);
```

These expressions expose intent directly. Expanding each into several branches or one-line helpers adds reading effort without a demonstrated benefit. Do not replace `??` with `||`: an empty name has different behavior.

## Review questions

- Can a reader locate the main path and each distinct step without decoding punctuation?
- Does every removed symbol have evidence of non-use, and does every removed computation have evidence of no required effects?
- Are conditional work, public contracts, ordering, errors, cleanup, and framework behavior preserved?
- Do names or helpers reduce mental work, or merely move it elsewhere?
- Are blank lines meaningful and consistent with the formatter?
- Would leaving an already-clear expression untouched produce a better diff?
