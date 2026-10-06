# Kiro recall

Use this invocation only when Kiro is selected. Run from the Todd mode skill directory:

```bash
bash scripts/recall.sh --agent kiro --workspace "/absolute/workspace/path" --query "topic" --exclude "current-session-id"
```

Replace the workspace placeholder with the user's target workspace. Replace `topic` with the requested topic, or omit `--query` for activity recall. Replace `current-session-id` with the current runtime's session ID or transcript path. If neither is available, omit that option and report that current-session exclusion could not be verified.

The script uses the Kiro history root and matches the workspace through session metadata rather than directory hashes.

Use `bash scripts/recall.sh --help` for scope and output limits. Transcript paths and formats are defined only in the script.
