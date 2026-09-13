# Understanding-first workbook package

Copy this entire directory to reuse the workflow. Its `resources/` include the generator, template, starter content, and official offline TOON 4.1.1 codec, without depending on the original project's context, discussions, or absolute paths. `SKILL.md` routes Agent tasks; this guide documents the commands.

## NEW: Create a workbook

`--destination` is required and must not exist. Missing parent directories are created automatically. Use the user's chosen location, or select `workbooks/<task-slug>/` in the caller project and state that location. Commands work from any working directory; absolute paths are recommended:

```sh
node /path/to/understanding-first/skill/init.mjs \
  --destination /path/to/caller-project/workbooks/my-workbook \
  --phase plan \
  --slug my-workbook
```

`--phase` defaults to `idea` and accepts `idea`, `spec`, `plan`, `build`, or `ship`. Initialization creates:

- `<phase>-manifest.json`: only the requested phase, stable item IDs, and `awaiting-user-approval` status.
- `<phase>-content.html`: starter cards, a diagram, and review hooks.
- `<phase>-review.json`: empty comments, with no inherited history or `originalReview`.
- `agent-context.json`: project-relative entrypoints, the current phase, and storage namespace.
- `idea.html`: the single offline entry, generated from the bundled template and codec.

Each new workbook receives a unique `workbookId`, isolating IndexedDB, legacy storage, and language preferences even when projects use the same slug. Existing destinations are rejected without overwriting or removing their data. Failed initialization removes its own staging directory.

Starting with `plan` creates an unapproved Plan, not fabricated Idea or Spec approvals or five prebuilt phases. Ship remains a read-only GO/NO-GO assessment, not deployment authorization.

## RESUME: Continue a workbook

Do not rerun initialization. Follow `SKILL.md` to locate the target in the caller project: an explicit target wins; otherwise use the sole directory containing both `agent-context.json` and `idea.html`. Ask the user to choose if several match. Read that target's context, phase source, and review JSON while preserving its local state and history.

To update phase content, specify the package and workbook paths separately:

```sh
SKILL_DIR=/path/to/understanding-first/skill
TARGET=/path/to/caller-project/workbooks/my-workbook
node "$SKILL_DIR/resources/workbook-generator.mjs" \
  --template "$SKILL_DIR/resources/workbook-template.html" \
  --manifest "$TARGET/plan-manifest.json" \
  --seed "$TARGET/plan-review.json" \
  --content "$TARGET/plan-content.html" \
  --output "$TARGET/idea.html" \
  --existing "$TARGET/idea.html"
```

For review-only updates, use data-only mode. The following command checks for drift without writing; omit `--check` to apply the update. Missing existing threads, replies, revisions, or `originalReview` cause rejection rather than silent data loss:

```sh
node "$SKILL_DIR/resources/workbook-generator.mjs" \
  --data-only --existing "$TARGET/idea.html" \
  --review-json "$TARGET/plan-review.json" \
  --output "$TARGET/idea.html" --check
```

Generated workbooks retain phase markers for later targeted updates. Content generation with `--existing` updates the selected content and review seed, manifest navigation metadata, and bundled TOON codec. It does not rebuild the entire shared runtime, CSS, or footer. Browser-local discussions remain managed by the workbook runtime; reinitialization is not a recovery mechanism. Verify UI changes with relevant tests and browser inspection.

Review JSON is the sole authoring source for Agent review data. TOON exports only the active phase's open, nondeleted discussions. Full backup preserves resolved and deleted records, replies, revisions, and drafts.
