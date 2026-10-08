# Pi recall

Use this invocation only when Pi is selected. Run from the `use-recall` skill directory:

```bash
bash scripts/recall.sh --agent pi --workspace "/absolute/workspace/path" --query "topic"
```

Replace the workspace placeholder with the user's target workspace. Replace `topic` with the requested topic, or omit `--query` for activity recall.

The script uses the Pi history root and excludes `PI_SESSION_FILE` and `PI_SESSION_ID` when available. If runtime metadata is absent, pass the current session ID or transcript path with `--exclude`.

Use `bash scripts/recall.sh --help` for scope and output limits. Transcript paths and formats are defined only in the script.
