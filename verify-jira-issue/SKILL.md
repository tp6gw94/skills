---
name: verify-jira-issue
description: Verify a Jira story by key - gather its AC, trace the code with RPC explorers, propose manual test steps, then drive Ego browser after approval.
disable-model-invocation: true
---

# Verify a Jira issue

Input: a Jira issue key such as `INIS-78`, optionally a target environment URL. The deliverable is an **AC trace**: every acceptance criterion mapped to the UI entry the user touches, the code that implements its Then, the test data it needs, and a verdict.

## 1. Gather the issue

In codemode, discover the `mcp__mcp_atlassian__*` tools, then fetch the issue with its comments (`jira_get_issue`, `comment_limit` high enough for the whole thread) and its linked issues. Follow the source document link (Confluence FRD/PRD page) with `confluence_get_page` and resolve every rule and exception ID the issue cites (`BR-xx`, `E-xx`).

Treat comments that describe test steps as leads to verify, not as the spec: an existing test path can target a different entry point than the AC names.

Done when every AC scenario is listed as Given / When / Then, every cited rule ID has its text, and the UI terms in the AC (screen, list, button names) are collected for the code search.

## 2. Trace the code through RPC explorers

Read the rpc-subagents skill fully before dispatching. Take the model from the `how explorer` line in `~/.agents/todd-models.md`: `provider/id:effort` becomes `model: { provider, id }` plus `thinking: effort`, and the fallback lines in that file apply on provider failure. Build each prompt from `~/.agents/skills/how/references/explorer-prompt.md` with the AC trace question and one angle.

Dispatch the explorers in parallel with `context: "fresh"`, `tools: ["read", "bash"]`, cwd at the repository root, and a read-only instruction. Each prompt carries the AC text, the collected UI terms, and its angle:

- **Entry**: map each AC UI term to its component through the zh-TW locale files (`public/locales/zh-TW/*.json`), then to the route and the handler that runs on the When action. Report the file:line of that handler, or report that it is absent.
- **Test data**: how the Given state comes to exist. Look for UI-configurable generators (rules, workflows, settings pages) and E2E seeds (`src/e2e/global/seeds/`) whose templates may already exist on the target environment. Report the URL path and fields a user sets.
- **Gaps and delivery**: `TODO`, `FIXME`, `disabled`, and placeholder handlers on the traced path, with `git blame` authors and commits. For the target environment, check whether the change reached it: `git log --all --oneline --grep <KEY>` and any `origin/pick/<key>-to-<env>` branch.

Wait for completed results and open every cited file:line yourself before using it. When a navigation or click does nothing, the cause is in its handler (an API-driven branch, an empty case); read it rather than attributing it to feature flags or the environment.

Done when every AC Then maps to a checked file:line that implements it, or to a checked gap.

## 3. Propose the manual test

Present to the user:

1. The AC trace, flagging any AC whose Then has no implementation.
2. Prerequisites: role or account, the patient or record to use, and how to create the Given data through the UI.
3. Numbered steps with full URLs and the expected result per AC.
4. The browser plan: each action that writes data on the environment (records created, forms submitted, settings changed), and the page where the run ends.

End the turn and wait for explicit approval of the browser plan. Approval covers only the listed side effects.

## 4. Drive the browser

Read the use-ego-browser skill fully, resolve its route, and fill its task contract:

- Goal: the approved plan.
- Target URLs: the environment URL.
- Allowed actions: the approved side effects plus read-only navigation.
- File ownership and Evidence directory: `/tmp/verify-jira-<key>/`.
- Acceptance checks: each AC Then's expected result.
- Existing TaskSpace: the ID and page label the user gave, or none.
- Deadline: the time limit you give the run.

Add to the contract that the run leaves the TaskSpace open without `task.finish`. Every browser action comes from the approved plan; this workflow skips the explore loop.

Resolve at runtime and pass the executor the absolute paths of [references/browser.md](references/browser.md) and use-ego-browser's `references/debug-kit.md`, plus the absolute `file://` URL of use-ego-browser's `scripts/debug-kit.mjs`. The executor creates the Given data first, confirms it exists through a read view (a list or debug page), then walks the AC steps.

Done when every AC Then has a `<label>.check.json` with its actual value and verdict, next to its `<label>.json` record and screenshot.

## 5. Report

Per AC: pass, fail, or not implemented, citing its `.check.json` (expected versus actual), record and screenshot paths, and code file:line for failures. Report the account name and role the run used. List every record created on the environment (template, patient, record name) and the TaskSpace ID left open; finish it only when the user asks. Offer a bug issue for each failure. Create one only when the user asks: issue type `Bug`, the same project, steps to reproduce, expected versus actual, the cause at file:line, then a `Relates` link to the story.
