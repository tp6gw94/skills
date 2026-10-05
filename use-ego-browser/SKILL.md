---
name: use-ego-browser
description: Operate ego-browser through an authorized executor across agent environments; prevent stdin hangs.
---

# use-ego-browser

## Scope

This skill covers invocation. It does not replace the vendor `ego-browser` skill. For browser-operation APIs such as `taskSpace`, `snapshot`, and `click`, first read:

```text
$HOME/.local/share/ego/ego-skills/SKILL.md
```

## Choose the execution route

If you are already the assigned browser executor, follow the task contract and executor guidance below directly. Do not route again or launch another agent.

For the coordinating agent, explicit session, user, and project execution policies and model overrides take precedence over this skill's defaults. Resolve the route before any browser command.

1. If policy requires Pi RPC, or Pi RPC is the available authorized delegation route, read [the Pi RPC adapter](references/pi-rpc.md).
2. If another native subagent system is the authorized route, use its own runner with the same task contract and executor guidance.
3. Without delegation, execute through an available shell only if policy permits direct execution.

A missing required delegation route, model, tool, or browser connection is a blocker. Report the missing requirement and request direction. Never silently substitute a model or fall back to direct execution.

The coordinating agent owns scope and evidence acceptance. Assign browser operations to one executor at a time. For follow-up work, resume that executor when available and reuse only a still-active TaskSpace. After `finish({keep:[]})`, the space is closed. Set `Existing TaskSpace: none` in the follow-up contract and let the executor create a new space.

## Prepare the task contract

Before dispatch or direct execution, replace every placeholder below with the current request. Keep paths relative or expressed through `$HOME`; expand them locally when required.

```text
Goal: <the user's concrete browser task>
Target URLs: <allowed URLs>
Allowed actions: <permitted interactions>
File ownership: <allowed input files and output paths>
Acceptance checks: <observable outcomes required before completion>
Evidence directory: <relative output directory>
Existing TaskSpace: <ID and page labels, or none>
Deadline: <execution time limit>
```

For delegation, include the filled contract and the complete executor guidance below in the child prompt. Read the vendor skill and include task-specific API details needed beyond that guidance. The child must have enough instructions to execute without rereading this routing skill. Verify that it can run shell commands, read documentation, inspect evidence images, and write permitted output files.

## Executor guidance

You are the sole Ego Lite browser executor. Operate ego-browser directly within the contract's URLs, actions, and file ownership. Do not delegate or launch other agents.

Run browser scripts through a shell tool using `ego-browser nodejs` with a heredoc ending at EOF. For `-e`, redirect stdin from `/dev/null`.

Reuse a supplied active TaskSpace and its page labels instead of creating a new space. Otherwise, create exactly one TaskSpace with `await taskSpace("browser task")` and print its `spaceId` immediately. Use `task.page("p1")` for its initial page. In later commands, resume with `await taskSpace(theRecordedId)`. Node variables do not persist between commands. Keep one active space for the task.

Navigate with `await page.goto(url)`. Inspect ordinary pages with `await page.snapshot()`, then use its refs or unique CSS selectors with `page.click()`, `fill()`, `selectOption()`, or `setInputFiles()`. Observe changed state before retrying an unexpected action.

For canvas interactions, use `page.screenshot()`, inspect the image with an image-viewing capability, and act with `page.mouse` or `page.keyboard`. Wait for the expected UI state and completed animations before visual evidence. Use `page.evaluate()` for read-only DOM inspection. Browser globals belong inside that callback.

For uploads, use `page.setInputFiles(selector, paths)`. For downloads, start `page.waitForEvent("download")` before clicking. Then await the download and `saveAs()` into the evidence directory in that same command. Resolve relative file paths locally if the API requires absolute paths.

Stop on user control, an inactive or unassigned space, or a browser-owned permission prompt. Report what is needed rather than bypassing the stop. Keep the same TaskSpace during recovery.

Check every acceptance outcome before finishing. On success, await `task.finish({keep:[]})` exactly once. Complete further observations before this call. Do not finish on an error or a user-control stop.

Use available file-reading and image-viewing capabilities for evidence inspection or additional documentation. Return the selected model and reasoning level when available, the TaskSpace ID and page labels, each check as `pass`, `fail`, or `not-run`, evidence paths, and remaining issues. Clearly separate verified results from observations.

## Accept the evidence

Check the evidence for every requested outcome, even when the executor reports successful completion. Identify failed or unrun checks separately. Report unresolved blockers instead of presenting observations as verified success.

## Invocation contract

`ego-browser nodejs` reads stdin to EOF before it validates arguments. An agent session's stdin is a socket that never reaches EOF (`/dev/fd/0` is `srw-rw-rw-`, and `isatty(0)` is false). Always let stdin reach natural EOF:

```bash
ego-browser nodejs <<'EOF'
const task = await taskSpace("inspect example page");
const page = task.page("p1");
console.log({ taskSpaceId: task.spaceId });
await page.goto("https://example.com");
console.log(await page.snapshot());
EOF
```

The heredoc above naturally produces EOF and is the standard invocation. By contrast, this `-e` form does not close stdin:

```text
ego-browser nodejs -e "console.log('ready')"
```

Without explicit stdin closure, that command silently hangs, produces zero output, and never exits. When `-e` is required, close stdin explicitly:

```bash
timeout 25 ego-browser nodejs -e "console.log('ready')" < /dev/null
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
