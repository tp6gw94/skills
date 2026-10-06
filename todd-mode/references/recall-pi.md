# Pi recall

Use this reference when Pi is selected for `/recall`. Apply the shared Agent-aware recall workflow in `../SKILL.md`.

- Runtime evidence includes `PI_CODING_AGENT` and `PI_SESSION_FILE`. Use `PI_SESSION_FILE`, when available, to exclude the current session.
- History root is `~/.pi/agent/sessions/`.
- Start in the current workspace's `--<slug>--/` directory, where `<slug>` is the absolute workspace path with the leading slash dropped and each `/` replaced by `-`.
- Read session `*.jsonl` files and confirm the session header's `cwd` matches the workspace before searching conversation content.
- Conversation entries have `type: "message"` with role and content under `message`.
