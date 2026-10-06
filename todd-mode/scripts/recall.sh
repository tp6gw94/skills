#!/usr/bin/env bash
set -euo pipefail

help() {
    printf '%s\n' \
        'Usage: bash recall.sh [options]' \
        '' \
        'Read-only Pi/Kiro history search. Requires Bash 3.2+ and jq 1.6+.' \
        'Outputs JSONL excerpts followed by one JSON summary. Session files stay unchanged.' \
        'Default roots: Pi ~/.pi/agent/sessions/; Kiro ~/.kiro/sessions/.' \
        '' \
        '  --agent auto|pi|kiro  Agent to search (default: auto; detects Pi runtime).' \
        '  --workspace PATH     Absolute workspace path (default: current directory).' \
        '  --query TEXT         Literal, ASCII-case-insensitive substring (default: all text).' \
        '  --days N             Session modification window (default: 7; 0: all dates).' \
        '  --limit N            Maximum excerpts (default: 20; range: 1..200).' \
        '  --max-chars N        Maximum Unicode characters per excerpt (default: 800; 1..4000).' \
        '  --max-bytes N        Total stdout byte ceiling, including summary (default: 12000; 1024..65536).' \
        '  --sessions N         Maximum matching sessions to inspect (default: 20; 1..1000).' \
        '  --exclude ID|PATH    Exclude a session ID or transcript path; repeatable.' \
        '  --root PATH          Override the selected agent history root.' \
        '  -h, --help           Show this help.' \
        '' \
        'Sessions are searched newest modification first; excerpts within a session are newest line first.' \
        'Only user/assistant text is returned. Queries match before clipping; excerpts start near the first match.' \
        'Pi current-session exclusions are automatic when PI_SESSION_FILE/PI_SESSION_ID are available.' \
        'For Kiro, pass the current session ID or messages.jsonl path with --exclude.' \
        'Output limits always apply; the summary reports partial coverage and malformed/unreadable files.' \
        'Exit codes: 0 = search completed (including no matches); 2 = invalid input or unavailable root/tool.' \
        '' \
        'Examples:' \
        '  bash recall.sh --agent pi --query authentication --limit 5 --max-bytes 6000' \
        '  bash recall.sh --agent kiro --workspace /absolute/workspace/path --exclude sess_current --days 30' \
        '  bash recall.sh --agent pi --days 0 --limit 10'
}

fail() {
    printf 'recall: %s\n' "$1" >&2
    exit 2
}

number() {
    local value=$2
    [[ $value =~ ^[0-9]{1,6}$ ]] || fail "$1 requires an integer in $3..$4"
    value=$((10#$value))
    (( value >= $3 && value <= $4 )) || fail "$1 requires an integer in $3..$4"
    printf -v "$1" '%d' "$value"
}

agent=auto
workspace=$PWD
query=
days=7
limit=20
max_chars=800
max_bytes=12000
sessions=20
root=
exclusions=()

while (( $# )); do
    case $1 in
        -h|--help) help; exit 0 ;;
        --agent|--workspace|--query|--days|--limit|--max-chars|--max-bytes|--sessions|--exclude|--root)
            (( $# >= 2 )) || fail "$1 requires a value"
            case $1 in
                --agent) agent=$2 ;;
                --workspace) workspace=$2 ;;
                --query) query=$2 ;;
                --days) number days "$2" 0 36500 ;;
                --limit) number limit "$2" 1 200 ;;
                --max-chars) number max_chars "$2" 1 4000 ;;
                --max-bytes) number max_bytes "$2" 1024 65536 ;;
                --sessions) number sessions "$2" 1 1000 ;;
                --exclude) exclusions+=("$2") ;;
                --root) root=$2 ;;
            esac
            shift 2
            ;;
        *) fail 'Unknown option; use --help' ;;
    esac
done

command -v jq >/dev/null 2>&1 || fail 'jq is required'
[[ $workspace == /* && -d $workspace ]] || fail '--workspace must be an existing absolute directory'
workspace=${workspace%/}
[[ -n $workspace ]] || workspace=/
if [[ $agent == auto ]]; then
    if [[ ${PI_CODING_AGENT:-} == true || -n ${PI_SESSION_FILE:-} ]]; then
        agent=pi
    else
        fail 'Cannot identify the active agent; pass --agent pi or --agent kiro'
    fi
fi
case $agent in
    pi)
        root=${root:-$HOME/.pi/agent/sessions}
        exclusions+=("${PI_SESSION_FILE:-}" "${PI_SESSION_ID:-}")
        ;;
    kiro) root=${root:-$HOME/.kiro/sessions} ;;
    *) fail '--agent must be auto, pi, or kiro' ;;
esac
[[ $root == /* && -d $root ]] || fail 'History root is missing or is not an absolute directory'

scratch=$(mktemp -d "${TMPDIR:-/tmp}/todd-recall.XXXXXXXX") || fail 'Cannot create temporary workspace'
trap 'rm -rf "$scratch"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
: > "$scratch/candidates"
cutoff=$(( $(date +%s) - days * 86400 ))
invalid=0
unreadable=0
missing=0
malformed_lines=0
candidates=0
scanned=0
emitted=0
output_bytes=0
stop_reason=complete
truncated=false

mtime() {
    local modified
    if modified=$(stat -f '%m' "$1" 2>/dev/null); then
        printf '%s\n' "$modified"
    else
        stat -c '%Y' "$1" 2>/dev/null
    fi
}

excluded() {
    local exclusion
    for exclusion in ${exclusions[@]+"${exclusions[@]}"}; do
        if [[ -n $exclusion && ( $exclusion == "$1" || $exclusion == "$2" ) ]]; then
            return 0
        fi
    done
    return 1
}

if [[ $agent == pi ]]; then
    slug=${workspace#/}
    directory=$root/--${slug//\//-}--
    if [[ -d $directory ]]; then
        find "$directory" -maxdepth 1 -type f -name '*.jsonl' -print0 > "$scratch/files" 2> "$scratch/find-errors" || true
    else
        : > "$scratch/files"
        : > "$scratch/find-errors"
    fi
else
    find "$root" \( -type d \( -name subagent-artifacts -o -name subagents -o -name eval -o -name tests \) -prune \) -o \( -type f -name session.json -print0 \) > "$scratch/files" 2> "$scratch/find-errors" || true
fi
[[ ! -s $scratch/find-errors ]] || unreadable=$((unreadable + 1))

while IFS= read -r -d '' metadata; do
    [[ $metadata != *_transcript.jsonl ]] || continue
    [[ -r $metadata ]] || { unreadable=$((unreadable + 1)); continue; }
    if [[ $agent == pi ]]; then
        if ! selection=$(jq -Rrn --arg workspace "$workspace" '
            first(inputs) | fromjson |
            if type != "object" or .type != "session" or (.id | type) != "string" then error("invalid header")
            elif .cwd == $workspace then .id | @base64 else empty end
        ' < "$metadata" 2>/dev/null); then
            invalid=$((invalid + 1))
            continue
        fi
        transcript=$metadata
    else
        if ! selection=$(jq -r --arg workspace "$workspace" '
            if type != "object" or (.id | type) != "string" or ((.workspacePaths // []) | type) != "array" or ((.rootPaths // []) | type) != "array" then error("invalid metadata")
            elif ((.workspacePaths // []) | index($workspace)) != null or ((.rootPaths // []) | index($workspace)) != null then .id | @base64
            else empty end
        ' "$metadata" 2>/dev/null); then
            invalid=$((invalid + 1))
            continue
        fi
        transcript=${metadata%/*}/messages.jsonl
    fi
    [[ -n $selection ]] || continue
    session_id=$(printf '%s' "$selection" | jq -Rr '@base64d')
    excluded "$session_id" "$transcript" && continue
    [[ -f $transcript ]] || { missing=$((missing + 1)); continue; }
    [[ -r $transcript ]] || { unreadable=$((unreadable + 1)); continue; }
    if ! modified=$(mtime "$transcript"); then
        unreadable=$((unreadable + 1))
        continue
    fi
    (( days == 0 || modified >= cutoff )) || continue
    encoded_path=$(printf '%s' "$transcript" | jq -Rs '@base64')
    printf '%s\t%s\t%s\n' "$modified" "$encoded_path" "$selection" >> "$scratch/candidates"
    candidates=$((candidates + 1))
done < "$scratch/files"
sort -nr "$scratch/candidates" > "$scratch/sorted"

while IFS=$'\t' read -r modified encoded_path selection; do
    if (( scanned >= sessions )); then
        stop_reason=sessions
        truncated=true
        break
    fi
    if (( emitted >= limit )); then
        stop_reason=limit
        truncated=true
        break
    fi
    transcript=$(printf '%s' "$encoded_path" | jq -r '@base64d')
    session_id=$(printf '%s' "$selection" | jq -Rr '@base64d')
    scanned=$((scanned + 1))
    remaining=$((limit - emitted))
    if ! jq -Rn --arg agent "$agent" --arg query "$query" --arg file "$transcript" --arg session "$session_id" --argjson limit "$remaining" --argjson chars "$max_chars" '
        def text_content:
            if type == "string" then .
            elif type == "array" then map(
                if type == "string" then .
                elif type == "object" and .type == "text" and (.text | type) == "string" then .text
                else "" end
            ) | map(select(. != "")) | join("\n")
            else "" end;
        reduce inputs as $line ({line: 0, items: [], matched: 0, errors: 0};
            .line += 1 |
            (try ($line | fromjson) catch null) as $entry |
            if ($entry | type) != "object" then .errors += 1
            else
                (if $agent == "pi" then
                    if $entry.type == "message" then $entry.message else null end
                else
                    if ($entry.payload.type == "user" or $entry.payload.type == "assistant") then
                        {role: $entry.payload.type, content: $entry.payload.content}
                    else null end
                end) as $message |
                if ($message.role == "user" or $message.role == "assistant") then
                    ($message.content | text_content) as $text |
                    if $text != "" and (($text | ascii_downcase) | contains($query | ascii_downcase)) then
                        (($text | ascii_downcase | index($query | ascii_downcase)) // 0) as $match |
                        ([$match - ($chars / 4 | floor), 0] | max) as $offset |
                        .matched += 1 |
                        .items += [{type: "excerpt", session_id: $session, file: $file, line: .line,
                            role: $message.role,
                            timestamp: ($entry.timestamp | if type == "string" or type == "number" then . else null end),
                            text: ($text[$offset:$offset + $chars] | gsub("[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]"; "")),
                            text_offset: $offset, text_truncated: (($text | length) > $chars)}] |
                        .items = .items[-$limit:]
                    else . end
                else . end
            end
        )
    ' < "$transcript" > "$scratch/results" 2>/dev/null; then
        invalid=$((invalid + 1))
        continue
    fi
    malformed_lines=$((malformed_lines + $(jq -r '.errors' "$scratch/results")))
    matched=$(jq -r '.matched' "$scratch/results")
    if (( matched > remaining )); then
        truncated=true
        stop_reason=limit
    fi
    jq -c '.items | reverse[]' "$scratch/results" > "$scratch/excerpts"
    while IFS= read -r record; do
        bytes=$(LC_ALL=C printf '%s\n' "$record" | wc -c)
        if (( output_bytes + bytes > max_bytes - 512 )); then
            stop_reason=max_bytes
            truncated=true
            break
        fi
        printf '%s\n' "$record"
        output_bytes=$((output_bytes + bytes))
        emitted=$((emitted + 1))
    done < "$scratch/excerpts"
    [[ $stop_reason != max_bytes ]] || break
done < "$scratch/sorted"

jq -cn --arg agent "$agent" --arg stop "$stop_reason" --argjson candidates "$candidates" --argjson scanned "$scanned" --argjson emitted "$emitted" --argjson truncated "$truncated" --argjson invalid "$invalid" --argjson unreadable "$unreadable" --argjson missing "$missing" --argjson malformed "$malformed_lines" '
    {type: "summary", agent: $agent, status: (if $emitted > 0 then "matches" elif $truncated then "output_limited" else "no_matches" end),
     candidates: $candidates, scanned_sessions: $scanned, emitted: $emitted, truncated: $truncated,
     stop_reason: $stop, invalid_files: $invalid, unreadable_files: $unreadable,
     missing_transcripts: $missing, malformed_lines: $malformed}
'
