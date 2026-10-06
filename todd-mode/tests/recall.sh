#!/usr/bin/env bash
set -euo pipefail

script=$(cd "$(dirname "$0")/../scripts" && pwd)/recall.sh
scratch=$(mktemp -d "${TMPDIR:-/tmp}/todd-recall-test.XXXXXXXX")
trap 'rm -rf "$scratch"' EXIT
unset PI_CODING_AGENT PI_SESSION_FILE PI_SESSION_ID
workspace=$scratch/workspace\ with\ spaces
mkdir -p "$workspace" "$scratch/other"
slug=${workspace#/}
pi_root=$scratch/pi
pi_directory=$pi_root/--${slug//\//-}--
kiro_root=$scratch/kiro
mkdir -p "$pi_directory" "$kiro_root/opaque/sess_one" "$kiro_root/opaque/sess_other"

pi_session() {
    jq -cn --arg id "$2" --arg cwd "$3" '{type: "session", id: $id, cwd: $cwd}' > "$1"
}

pi_message() {
    jq -cn --arg role "$2" --arg text "$3" '{type: "message", timestamp: "2026-10-01T00:00:00Z", message: {role: $role, content: [{type: "text", text: $text}]}}' >> "$1"
}

search() {
    bash "$script" --agent pi --root "$pi_root" --workspace "$workspace" --days 0 "$@"
}

expect_error() {
    local status=0
    bash "$script" "$@" > "$scratch/error-out" 2> "$scratch/error-err" || status=$?
    [[ $status == 2 && -s $scratch/error-err ]] || { printf 'Expected input error\n' >&2; exit 1; }
}

assert_json() {
    jq -es "$1" "$scratch/output" >/dev/null || { printf 'JSON output assertion failed: %s\n' "$1" >&2; exit 1; }
}

pi_session "$pi_directory/main.jsonl" pi-main "$workspace"
pi_message "$pi_directory/main.jsonl" user 'Authentication first'
pi_message "$pi_directory/main.jsonl" toolResult 'authentication tool secret'
pi_message "$pi_directory/main.jsonl" assistant 'AUTHENTICATION second'
printf '%s\n' 'not JSON' >> "$pi_directory/main.jsonl"
pi_message "$pi_directory/main.jsonl" user '登入 修正討論'
pi_session "$pi_directory/current.jsonl" pi-current "$workspace"
pi_message "$pi_directory/current.jsonl" user 'authentication current session'
pi_session "$pi_directory/foreign.jsonl" pi-foreign "$scratch/other"
pi_message "$pi_directory/foreign.jsonl" user 'authentication foreign workspace'
pi_session "$pi_directory/broken.jsonl" pi-broken "$workspace"
printf '%s\n' 'invalid header' > "$pi_directory/broken.jsonl"
mkdir -p "$pi_directory/subagent-artifacts"
pi_session "$pi_directory/subagent-artifacts/child.jsonl" pi-child "$workspace"
pi_message "$pi_directory/subagent-artifacts/child.jsonl" user 'authentication child'

jq -cn --arg cwd "$workspace" '{id: "kiro-one", workspacePaths: [$cwd], rootPaths: []}' > "$kiro_root/opaque/sess_one/session.json"
jq -cn '{payload: {type: "user", content: "authentication Kiro user"}}' > "$kiro_root/opaque/sess_one/messages.jsonl"
jq -cn '{payload: {type: "assistant", content: [{type: "text", text: "Authentication Kiro assistant"}, {type: "thinking", text: "private reasoning"}]}}' >> "$kiro_root/opaque/sess_one/messages.jsonl"
jq -cn '{payload: {type: "tool_result", content: "authentication tool secret"}}' >> "$kiro_root/opaque/sess_one/messages.jsonl"
jq -cn --arg cwd "$scratch/other" '{id: "kiro-other", workspacePaths: [$cwd]}' > "$kiro_root/opaque/sess_other/session.json"
jq -cn '{payload: {type: "user", content: "authentication other workspace"}}' > "$kiro_root/opaque/sess_other/messages.jsonl"
find "$pi_root" "$kiro_root" -type f -exec cksum {} \; | sort > "$scratch/before"

bash "$script" --help > "$scratch/help"
grep -q -- '--max-bytes' "$scratch/help"
grep -q -- '--limit' "$scratch/help"
expect_error --limit 0
expect_error --limit abc
expect_error --max-bytes 0
expect_error --sessions 1001
expect_error --unknown
expect_error --agent
expect_error --agent unsupported
expect_error --agent auto
expect_error --agent pi --root "$scratch/missing"
expect_error --agent pi --root "$pi_root" --workspace relative

PI_SESSION_FILE=$pi_directory/current.jsonl PI_SESSION_ID=pi-current search --query authentication > "$scratch/output"
assert_json 'map(select(.type == "excerpt")) | length == 2 and all(.session_id == "pi-main") and .[0].text == "AUTHENTICATION second" and .[1].text == "Authentication first"'
assert_json '.[-1] | .type == "summary" and .emitted == 2 and .invalid_files == 1 and .malformed_lines == 1'
assert_json 'map(select(.type == "excerpt")) | .[0].line == 4 and .[1].line == 2'

search --exclude pi-current --query authentication --limit 1 > "$scratch/output"
assert_json 'length == 2 and .[0].text == "AUTHENTICATION second" and .[-1].emitted == 1 and .[-1].truncated == true and .[-1].stop_reason == "limit"'

search --exclude "$pi_directory/current.jsonl" --query 登入 --max-chars 2 > "$scratch/output"
assert_json '.[0].text == "登入" and .[0].text_truncated == true and .[-1].emitted == 1'

search --query unmatched-topic > "$scratch/output"
assert_json 'length == 1 and .[0].status == "no_matches" and .[0].emitted == 0'

bash "$script" --agent kiro --root "$kiro_root" --workspace "$workspace" --days 0 --query authentication > "$scratch/output"
assert_json 'map(select(.type == "excerpt")) | length == 2 and all(.session_id == "kiro-one") and .[0].text == "Authentication Kiro assistant"'
assert_json '.[-1] | .agent == "kiro" and .emitted == 2 and .truncated == false'

bash "$script" --agent kiro --root "$kiro_root" --workspace "$workspace" --days 0 --exclude kiro-one > "$scratch/output"
assert_json 'length == 1 and .[0].candidates == 0 and .[0].status == "no_matches"'

jq -cn --arg cwd "$workspace" '{id: "kiro-one", rootPaths: [$cwd]}' > "$kiro_root/opaque/sess_one/session.json"
bash "$script" --agent kiro --root "$kiro_root" --workspace "$workspace" --days 0 --limit 1 > "$scratch/output"
assert_json '.[0].session_id == "kiro-one" and .[-1].emitted == 1'
jq -cn --arg cwd "$workspace" '{id: "kiro-one", workspacePaths: [$cwd], rootPaths: []}' > "$kiro_root/opaque/sess_one/session.json"

PI_CODING_AGENT=true bash "$script" --root "$pi_root" --workspace "$workspace" --days 0 --limit 1 > "$scratch/output"
assert_json '.[-1].agent == "pi" and .[-1].emitted == 1'

search --sessions 1 --limit 200 > "$scratch/output"
assert_json '.[-1] | .scanned_sessions == 1 and .truncated == true and .stop_reason == "sessions"'

find "$pi_root" "$kiro_root" -type f -exec cksum {} \; | sort > "$scratch/after"
cmp "$scratch/before" "$scratch/after"

large=$(jq -nr '"登入" * 1000')
pi_message "$pi_directory/main.jsonl" user "$large"
search --exclude pi-current --query 登入 --max-chars 4000 --max-bytes 1024 > "$scratch/output"
[[ $(wc -c < "$scratch/output") -le 1024 ]]
assert_json 'length == 1 and .[0].status == "output_limited" and .[0].truncated == true and .[0].stop_reason == "max_bytes"'
search --exclude pi-current --query 登入 --max-chars 10 --max-bytes 1024 > "$scratch/output"
[[ $(wc -c < "$scratch/output") -le 1024 ]]
assert_json 'map(select(.type == "excerpt")) | all((.text | length) <= 10)'

suffix=$(jq -nr '("x" * 1000) + "literal[topic]" + ("y" * 1000)')
pi_message "$pi_directory/main.jsonl" assistant "$suffix"
search --exclude pi-current --query 'literal[topic]' --max-chars 40 > "$scratch/output"
assert_json '.[0] | (.text | contains("literal[topic]")) and (.text | length) <= 40 and .text_offset > 0 and .text_truncated == true'

search --exclude pi-current --max-bytes 12000 > "$scratch/output"
[[ $(wc -c < "$scratch/output") -le 12000 ]]
assert_json 'map(select(.type == "excerpt")) | length <= 20 and all((.text | length) <= 800)'

touch -t 200001010000 "$pi_directory/main.jsonl" "$pi_directory/current.jsonl"
search --days 7 --query authentication > "$scratch/output"
assert_json 'length == 1 and .[0].candidates == 0'

mkdir -p "$kiro_root/opaque/sess_missing"
jq -cn --arg cwd "$workspace" '{id: "kiro-missing", workspacePaths: [$cwd]}' > "$kiro_root/opaque/sess_missing/session.json"
bash "$script" --agent kiro --root "$kiro_root" --workspace "$workspace" --query absent > "$scratch/output"
assert_json '.[-1].missing_transcripts == 1'

printf '%s\n' 'Recall CLI tests passed.'
