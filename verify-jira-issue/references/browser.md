# Ego browser operation notes

Observed behavior of native ego-browser rounds against the HIS web app. The use-ego-browser skill and its debug kit are the contract; these notes cover what they leave out.

## TaskSpace and evidence

- When the contract names an existing TaskSpace, resume it with `taskSpace(id)`. A user-owned space needs `claimTaskSpace(id)` instead, used only when the user explicitly said to use that space. Confirm the page label with `await task.tabs()` and `task.adopt(tab.page)` an unlabeled tab before use. Otherwise create one with a unique name such as `verify-jira-<key>-<timestamp>` and print its `spaceId` first.
- The user's Ego profile already carries the HIS login session. Read the account name and role from the header on the first observation and report them; role-gated behavior depends on it.
- Give each AC When its own directory under `/tmp/verify-jira-<key>/`, and wrap each action in one `probe.around` call with a new label there. The repository does not ignore evidence directories.

## AC checks

Capture each Then with `around(null, { label, screenshot: true, ... })`. In the same round, read the actual value with `page.evaluate` and write `<label>.check.json` beside `<label>.json`:

```json
{ "ac": "AC2", "selector": "[role=dialog] tbody tr:nth-child(1) td:nth-child(3)", "expected": "...", "actual": "...", "pass": true }
```

## Selectors

- `openProbe` calls `Runtime.enable`, which stales snapshot refs, and a round cannot read its own snapshot output. Use snapshots only to derive CSS, `loc=`, `text=`, or `:has-text` selectors; probe-wrapped actions take those selectors, never refs.
- Native `click`, `fill`, and `selectOption` accept the vendor selector forms, such as `button:has-text('儲存')` or `loc=role:button[name='儲存']`. Debug-kit `styles` and `page.evaluate` run through `querySelectorAll`, so give them plain CSS.
- Table rows have no snapshot ref. Target them with CSS plus `:has-text("<record name>")` or `>> nth=N`; actions need exactly one match.
- Snapshots are long. Write them to a file in the evidence directory and read it with `grep -v svg_root` and `sed -n '/dialog/,$p'`.

## Waiting on the SPA

`goto` and clicks that trigger a query resolve before the data renders. In the same round, wait with `waitForSelector` or `waitForFunction` on the expected data text, such as the record name inside `tbody`, with an explicit `timeout` such as `15_000`, then capture with `around(null, ...)`. On timeout, still capture with `around(null, { screenshot: true, ... })`, read the actual value, and write `<label>.check.json` with `pass: false`. A wait timeout is a failed check, never a reason to resend the action.

## Recovery

- An approved write is sent at most once. When its record is not settled as `captured` (`dispatching`, `action_error`, `uncertain_effect`), or its round exited nonzero with the record missing or still `open`, only observe it afterwards: `around(null, ...)` under a new label in the same TaskSpace, or a read view. Report what changed and continue from the observed state. Sending it again under any label needs fresh user approval.
- A timed-out round can still be running. Before observing a record left in `dispatching` or a round that exited nonzero, poll the record until it leaves `dispatching`, up to about 30 s. If it is still `dispatching`, stop and report instead of observing alongside it.
- Outcome `dialog`: stop and report its message. The user decides between `acceptDialog` and `dismissDialog`.
