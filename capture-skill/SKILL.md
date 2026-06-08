---
name: capture-skill
description: Capture learnings, patterns, or workflows from the current conversation into a new or existing skill. Use when the user says "save this as a skill", "capture this for next time", or when a useful workflow emerged that should be preserved.
---

# Capture Skill from Conversation

## Process

1. **Identify**: Review conversation for workflows, gotchas, patterns, or domain knowledge worth preserving
2. **Confirm scope**: Summarize what you plan to capture; confirm with user
3. **Decide destination**: New or existing skill? Personal (`~/.cursor/skills/`) or project (`.cursor/skills/`)?
4. **Write**: Follow distillation guidelines below
5. **Verify**: Under 500 lines, description has trigger terms, content is accurate

## Distillation Guidelines

Transform messy conversation into clean, reusable instructions.

**Do:**
- Extract the final working approach, not failed attempts (unless gotchas are instructive)
- Generalize from specific case (replace hardcoded values with `<placeholders>`)
- Include the "why" behind non-obvious steps
- Add only context the agent wouldn't already know

**Don't:**
- Include conversation artifacts ("as we discussed", "you mentioned")
- Repeat general knowledge the agent already has
- Add verbose explanations where a code example suffices

## Updating Existing Skills

1. Read the existing SKILL.md first
2. Integrate new learnings without duplicating content
3. Preserve existing structure and voice

## Edge Cases

| Situation | Action |
|-----------|--------|
| Multiple topics in conversation | Ask which to capture, or create separate skills |
| Learning too small for a skill | Create a Cursor rule (`.cursor/rules/`) instead |
| Existing skill needs major rewrite | Confirm: restructure existing or create new one? |
