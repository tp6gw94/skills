# Debug kit

Use the debug kit when an action needs same-round network, console, DOM, style, or screenshot evidence. Import `scripts/debug-kit.mjs` through an absolute `file://` URL resolved from the skill directory at runtime. Node rounds have no reliable working directory.

## Public API

`openProbe(page)` enables Runtime and drains the event buffer once. It returns a probe with `around(actionOrNull, options)` and `markDialog(record, error)`. The probe is the only reader of `page.events()` for that round.

```js
const { openProbe } = await import(debugKitFileUrl);
const probe = await openProbe(page);
const record = await probe.around(() => page.click("#submit"), {
  dir: evidenceDir,
  label: "submit-order",
  styles: [{ name: "confirmation", selector: "#confirmation", props: ["color", "display"] }],
  bodies: "api",
  window: { minMs: 300, idleMs: 400, capMs: 10000 },
});
```

Use `around(null, options)` to watch and observe without dispatching an action. Several calls can use the same probe. Each call needs a new label in its evidence directory.

Options are `dir` (absolute), `label`, `styles` (default `[]`), `bodies` (`"api"`, `"all"`, or `"none"`; default `"api"` captures Document, XHR, and Fetch responses), `bodyMaxBytes` (default 262144), `window` (`minMs:300`, `idleMs:400`, `capMs:10000` by default), `screenshot` (default `false`), and `deadlineAt` (epoch milliseconds, default none). A style entry names a CSS selector and the computed properties to capture.

## Record file and phases

Each call owns `${dir}/${label}.json`. It creates the file with exclusive creation as `{ "phase": "open" }`. An existing file makes the call fail before dispatch, so reusing a label never resends its action.

The record moves through this closed phase set:

- `open` means no action was sent.
- `dispatching` includes `dispatchedAt` and is atomically published immediately before the action call. The action may have reached the browser.
- `settled` includes `outcome` and the available evidence. Outcomes are `captured`, `action_error`, `dialog`, and `uncertain_effect`.

An `action_error` record means the action threw and the observation window still completed. A `dialog` record means a JavaScript dialog was open when evidence assembly finished. The kit has one way to learn about a dialog, the buffered `Page.javascriptDialogOpening` event applied by the same pump that applies console and network events. An action receipt that carries a dialog is applied as that same event. Any page call inside `around` that fails with `PageDialogOpenedError` (the before digest, the action, a body fetch, or the after digest, styles, and screenshot) makes the kit read the event buffer through that pump, so console and network events in the same batch belong to this record. The dialog comes from the event, or from the error message when no event is buffered. The kit then skips the remaining page calls. A dialog seen in the window ends it at once with `window.endedBy` set to `dialog`. A dialog found by a failing after-window call leaves `window.endedBy` as it was. A dialog already open before the call settles the record as `dialog` without sending the action. The kit stores the dialog once in `dialog`, with `message` and `defaultPrompt` cut to 500 characters, removes it from `action.receipt`, and does not accept or dismiss it. `after` is `null` unless the digest was captured before the dialog opened, and `styles` is `{}` unless the styles were captured before the dialog opened. The caller handles the dialog with `page.acceptDialog()` or `page.dismissDialog()`. `uncertain_effect` means evidence assembly failed after dispatch.

Every settle path ends in one finalization. It builds the summary, cuts the request part to leave room for the dialog marker, appends `javascript dialog open` when a dialog is stored, trims the record to its size budget, and writes it atomically. The summary therefore always ends with the marker for a `dialog` record, and the record stays under 32 KiB.

`probe.markDialog(record, error)` is for a caller whose own page call fails with `PageDialogOpenedError` after `around` returned, as the explore step's scan does. It accepts only the in-memory record that this probe's `around` just returned, never a record read from disk. It reads the event buffer, stores the dialog, sets the outcome to `dialog`, and finalizes the record again; it resolves to `true`. For any other record, including one that `around` settled as `uncertain_effect`, it changes nothing and resolves to `false`. The explore step then keeps the interpreted outcome and `dispatched` flag, adds the error to the result's `issue`, skips the scan, and does not rewrite the record file. `isDialogOpenedError(error)` is exported for the check.

Requests, console, action, and window are assembled into the record before any after-window evaluation. The after digest, styles, and screenshot are captured independently, and a failure of one (for example an execution context destroyed by a navigation) is recorded as `afterError`, `stylesError`, or `screenshotError` while the outcome stays `captured`. A `PageDialogOpenedError` is not such a failure; it settles the record as `dialog`. The failed field keeps its empty value (`after: null`, `styles: {}`). The styles evaluation runs only when `styles` is non-empty. A style whose selector throws gets `{ "error": "<message>" }` as its entry in `styles`, and the other styles still run. Each captured style property value is cut to 500 characters, and the properties that were cut are listed in the value's `truncated` array. If a process dies while the record is `dispatching`, treat the effect as uncertain and inspect the page or server state. Never replay it automatically.

The record contains before and after page digests, requested computed styles, requests, counts, console entries, action receipt or error, a summary, and the capture window. The window contains `startedAt`, `actionAt`, `endedAt`, `endedBy`, and incomplete request sequence numbers. `endedBy` is `idle`, `cap`, or `dialog`. Only requests whose URL scheme is `http`, `https`, `ws`, or `wss` are recorded; browser-internal `chrome:` traffic is dropped. Requests list sequence number `n`, URL, method, type, request post data, status, duration, completion state, and response-body path when available. `state` is `finished`, `failed`, `redirected`, or `in_flight`. A redirect hop keeps its 3xx status with state `redirected`, and the next hop is a separate entry. `durationMs` is the difference between the CDP event timestamps of the request start and its finish, not processing time. A response body skipped because the capture budget (see below) was spent, or because the window ended before it was fetched, carries `bodySkipped: "budget"`. Request IDs stay private to the kit. Bodies are decoded to bytes and stored under `${dir}/${label}.bodies/`; large bodies do not go in the record. The record caps request entries at 200 and stays under 32 KiB. Styles have their own 8 KiB budget, enforced by dropping trailing matched elements from the largest entry (`valuesDropped`) and then replacing an entry with `{ "omitted": "size" }`. If the record is still too large, `fitRecord` trims in this order: replay console entries (oldest first), styles, window console entries (latest first), and requests last. Dropped entries are reported in `counts`.

The action completes before the event pump runs. Each pump pass applies the buffered events, fetches the queued response bodies while no dialog is open, and then applies the events that arrived meanwhile, without fetching their bodies. The pump repeats every 50 ms until the minimum window has elapsed, no requests remain in flight, and the idle interval has elapsed, or the cap is reached. Requests still running at the cap, or unfinished when a dialog opened, have `state: "in_flight"` and appear in `window.incomplete`. The cap is `min(actionAt + capMs, deadlineAt)`, with `deadlineAt` ignored when unset. Each `Network.getResponseBody` wait is limited to the time left before that cap, with or without a `deadlineAt`, so slow bodies cannot stretch the window; once the time is spent the remaining bodies are skipped. A finite window cannot promise to capture traffic that starts after it ends.

Console entries carry `level`, `text`, `url`, and `phase: "replay"` or `phase: "window"`, and are deduplicated within the round by an internal key that is not written to the record. `counts.console` is the number of distinct console entries seen, including replay entries and dropped ones. The summary's console error count covers `window` entries only and is counted at intake after deduplication, so it does not depend on which entries the caps retained. Replay entries are capped separately: only the most recent 20 are kept, and older ones count in `counts.consoleDropped`. Window entries (up to 100) are always retained ahead of replay entries when the record is trimmed. Replay entries drained when the probe opens attach to the probe's first `around` record only. Runtime console and exception events from the document that navigates away must be collected before that document disappears.

## Measured facts

These observations were measured on Ego Lite 0.6.0.12:

- `page.events()` reads and clears the buffer. Use one reader for every event in a round.
- Network events arrived without `Network.enable`; Runtime console and exception events required `Runtime.enable`.
- Calling `Runtime.enable` after taking a snapshot made its refs stale. Enable Runtime before snapshots or other refs.
- `Network.getResponseBody` worked in the round that saw the request and failed in a later round with `No resource with given identifier found`.
- Navigation did not restore earlier console history. Capture the old document's console before it navigates away.
- Node output appeared on stderr behind an `[ego-browser:notice]` line, and stdout was empty. Transfer data in files and read it with `tools.read`; do not parse command output.
- A shell `timeout` around `ego-browser nodejs` kills the client process but can leave the node round running. In acceptance scenario 6 the killed round's click still reached the server, and the round later failed with `page label not found: p1`. A killed round's action may still complete. The record phase is the source of truth, and the loop never resends the action.
- `Page.javascriptDialogOpening` arrived through `page.events()` about 50 ms after a click whose handler ran `setTimeout(() => alert(...), 100)`, with an empty receipt and without `Page.enable` (only `Runtime.enable` was active). The event params have the same shape as `receipt.dialog` (`url`, `frameId`, `message`, `type`, `hasBrowserHandler`, `defaultPrompt`). The kit therefore does not enable the Page domain. Whether `Page.enable` would stale refs was not measured, and the guide says raw CDP invalidates refs.
- With a JavaScript dialog open, `page.click()` returned the dialog in `receipt.dialog`. `page.evaluate()` did not hang. It failed fast with `PageDialogOpenedError: Runtime.evaluate cannot run while a JavaScript alert dialog ("Late dialog") is open; handle it with page.acceptDialog() or page.dismissDialog() before continuing`. `page.events()` stayed readable and still delivered `Page.javascriptDialogOpening`. The round stayed alive about 15 seconds after the script finished. A dialog is therefore detectable after the window ended, by the error name or by draining events. Check the receipt, treat `PageDialogOpenedError` as a dialog signal, and never retry the evaluation until the dialog is handled.
- While a dialog is open, `Network.loadingFinished` does not arrive and `Network.getResponseBody` fails with `PageDialogOpenedError`. A request that was unfinished when the dialog opened therefore stays `in_flight` with its status and no duration, and its body is not saved. Observed in acceptance scenario 18 (a `/slow` request stayed `in_flight` with status 200 and `durationMs: null`) and scenario 27 (`bodyError` held the `PageDialogOpenedError`).
- Observed once, conditions unconfirmed and not a reliable fact: a new round that attached while a dialog opened by an earlier round was still open waited on `Runtime.enable` until `CdpRequestTimeoutError` after about 30 seconds. A later attempt to reproduce the situation did not show it. Handle a known dialog before starting another round.
- Modules imported by absolute `file://` URL resolved their relative imports. Ego scripts had no shell environment or working directory. Resolve script imports from the skill directory at runtime.

## Approved-plan evidence

For an approved plan, attach to the existing TaskSpace ID with `taskSpace(id)` and use its existing page. Do not create a replacement space to recover from a failed action. Keep one executor per TaskSpace.

Give each user-visible `When` its own evidence directory. Capture one `around` record per action, with the planned selectors and styles. Keep the TaskSpace open after verification. Call `task.finish({keep:[]})` only when the user asks.

A separate TaskSpace is not a separate browser profile or server. Parallel loops share cookies and server data. No cross-process lock prevents two executors from acting on one TaskSpace.
