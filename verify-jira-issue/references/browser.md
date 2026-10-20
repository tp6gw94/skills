# Ego browser operation notes

Observed behavior of `ego_browser` against the HIS web app. The ego-browser-tools skill is the contract; these notes cover what it leaves out.

## Calling

- `ego_browser` is deferred. After `tool_search` loads it, call it from codemode as `tools.ego_browser({ request })` when the direct call reports the tool as unavailable.
- `space.create` opens a tab in the user's Ego profile, which already carries the HIS login session. Read the account name and role from the header on the first observation and report them; role-gated behavior depends on it.
- Put evidence under `/tmp/verify-jira-<key>/`; the repository does not ignore evidence directories.
- The contract `text` map is fixed at `begin`. List every value the run fills (search keywords, form values) up front.

## Selectors

- Action targets accept Ego semantic selectors such as `button:has-text('儲存')`. `after` conditions and `checks` run through `querySelectorAll`, so they take plain CSS only; an invalid selector there freezes the task.
- Table rows carry no ref in snapshots. Target them with CSS such as `[role=dialog] tbody tr`.
- Read `snapshotPath` with `grep -v svg_root` and `sed -n '/dialog/,$p'` to find refs; snapshots are long.

## Waiting on a SPA

- After `navigate`, an `after` of `visible body` passes before data renders. Follow it with an observe loop (up to about 6 observes) whose check is the data text, such as `text` on `tbody` including the expected record.
- Give clicks that trigger a network query a loose `after` (`visible body` or the dialog), then observe for the data. An `after` that times out on slow data freezes the task as `uncertain_effect`.

## Recovering from a freeze

On `uncertain_effect`: observe the frozen task to see what the action changed, report it, release the task, then `begin` a new task with `space.attach` set to the same space ID and continue from the current page. Carry the mutation forward from the observed state; the frozen action never runs a second time.

## Closing

Release the task when done and leave the space open so the user can inspect it. Finish (which closes the space) only when the user asks.
