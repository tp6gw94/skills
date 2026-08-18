---
name: use-ego-browser
description: Use ego-browser correctly inside macOS sandbox or agent sessions, and debug ego-browser hangs or connection failures in those environments.
---

# use-ego-browser

## Scope

This skill covers invocation and debugging inside macOS sandbox or agent sessions. It does not replace the vendor `ego-browser` skill. For browser-operation APIs such as task space, `snapshotText`, and `click`, first read:

```text
/Users/todd/.local/share/ego/ego-skills/SKILL.md
```

## Invocation contract

`ego-browser nodejs` reads stdin to EOF before it validates arguments. An agent session's stdin is a socket that never reaches EOF (`/dev/fd/0` is `srw-rw-rw-`, and `isatty(0)` is false). Always let stdin reach natural EOF:

```bash
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('inspect example page')
cliLog('task space id: ' + task.id)
await openOrReuseTab('https://example.com', { wait: true, timeout: 20 })
cliLog(await snapshotText())
EOF
```

The heredoc above naturally produces EOF and is the standard invocation. By contrast, this `-e` form does not close stdin:

```text
ego-browser nodejs -e "cliLog('ready')"
```

Without explicit stdin closure, that command silently hangs, produces zero output, and never exits. When `-e` is required, close stdin explicitly:

```bash
timeout 25 ego-browser nodejs -e "cliLog('ready')" < /dev/null
```

Measured comparison in the same sandbox with the same policy, differing only in stdin redirection:

```text
$ timeout 25 ego-browser nodejs -e "cliLog('ready')" < /dev/null
ready                                    # exit 0
$ timeout 45 ego-browser nodejs -e "cliLog('ready')"
                                         # zero output, exit 124
```

The `--help` output explains:

```text
With TTY stdin and no source script, ego-browser starts an interactive REPL. When stdin is piped and no command is provided, ego-browser forwards the stdin payload to the embedded Node runtime as a script.
```

## Argument constraints

Use a valid server name. A nonexistent name passed through this option hangs indefinitely without reporting an error or timing out, even when stdin is redirected correctly:

```text
--ego-server-name=<name>
```

The following logging flags are invalid under the `nodejs` subcommand:

```text
--enable-logging=stderr
--v=2
```

The actual error is `ego-cli nodejs accepts at most one source argument`. It appears after stdin is drained, so socket stdin hides it and shows only a hang.

## Debugging decision tree

1. **Zero output and no exit (silent hang):** Treat stdin as the primary suspect. Add `< /dev/null`, or retry once with a heredoc; the sandbox is not the first suspect.
2. **Fast failure with a bootstrap connection failure:** Compare the complete error first:

   ```text
   Failed to connect to ego_cli bootstrap
   ```

   The app has not published the bootstrap service. Fully quit and reopen the ego lite app with `Cmd+Q`, rather than only closing the window.

   The following canned message is misleading:

   ```text
   Agent note: ... cannot connect to the ego_cli bootstrap from the default agent sandbox. A running ego.app is not enough; retry with Full Access or run ego-browser outside the agent sandbox.
   ```

   The tested fix is to fully quit and reopen the ego lite app with `Cmd+Q`, not to modify the sandbox policy. Keep the permissions unchanged when this message appears.
3. **`--help` or `--version` also fails:** Treat this as an installation or environment problem, and then read the vendor skill's `references/install.md`. If `--help` and `--version` succeed instantly but `nodejs` fails, installation is ruled out and the problem is narrowed to case 1 or case 2.

## Ruled-out sandbox permissions

Treat these findings as already checked; continue with the debugging decision tree instead of repeating sandbox-permission investigation:

- `(allow network*)` is fully enabled, with no domain or port restrictions; `curl https://x.com` returns 200.
- ego's Mach bootstrap lookup (`com.citrolabs.ego.lite.ego-browser` and similar names) returns 0 inside the sandbox.
- The `global-name-regex` validation in `ego-addon.sb` is correct.
- Although `com.apple.lsd.open` is denied, it is not the cause of failure; the same policy succeeds on the host. Do not add a rule: doing so would let the sandbox launch arbitrary external apps, creating an escape risk.
- The Chromium `SingletonSocket` directory under TMPDIR is readable and listable inside the sandbox, with the same path as on the host.
- The CLI and app versions do not have skew.

Use `bootstrap_look_up` return codes to distinguish these cases:

```text
0    = success
1100 = denied by Seatbelt (not in the allowlist)
1102 = allowed by the sandbox, but launchd does not have this service (case 2: reopen the app)
```

## Diagnostic tools inside the sandbox

Unavailable:

```text
pgrep / ps: unavailable (sysmond service not found)
/usr/bin/log show: unavailable (Cannot run while sandboxed)
```

Available:

```text
launchctl print gui/501
lsof -p <pid>
ls
curl
```

Only the user can retrieve Seatbelt denial logs on the host. In zsh, `log` is a builtin; to run the system tool, write `/usr/bin/log`.
