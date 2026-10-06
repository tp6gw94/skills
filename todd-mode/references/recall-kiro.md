# Kiro recall

Use this reference when Kiro is selected for `/recall`. Apply the shared Agent-aware recall workflow in `../SKILL.md`.

- History root is `~/.kiro/sessions/`.
- Discover `session.json` metadata under the nested workspace/session directories.
- Select sessions whose `workspacePaths` or `rootPaths` contain the current workspace's absolute path before searching conversation content. Directory hashes are not workspace evidence.
- Use the metadata's `id` and the current runtime's session ID or path, when available, to exclude the current session.
- Read the selected session directory's `messages.jsonl`. Conversation entries have `payload.type` equal to `user` or `assistant`, with content under `payload.content`.
- Metadata is JSON, not a JSONL transcript.
