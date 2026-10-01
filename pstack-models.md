# pstack model configuration. One line per role. Delete a line to fall back to the skill default.
# `inherit-parent` or `auto` runs on the parent chat model (omit the subagent `model`). Alias entries in a panel list still count toward its fan-out.
# budget: unlimited (max)
# Pi model values use provider/id:effort; the effort suffix is a subagent reasoning override, not part of the registry model ID.
# OpenCode Go maps DeepSeek :xhigh to upstream max; MiMo remains at high under the current provider mapping.
feature, refactoring: openai-codex/gpt-6.1-sol:max
bug-fix: openai-codex/gpt-6.1-sol:max
perf-issue: openai-codex/gpt-6.1-sol:max
hillclimb: openai-codex/gpt-6.1-sol:max
judgment and prose: openai-codex/gpt-6.1-sol:max
hardest tasks: openai-codex/gpt-6.1-sol:max
how explorer: opencode-go/mimo-v2.6-flash:high
how explainer: openai-codex/gpt-6-luna:max
why investigators: opencode-go/deepseek-v4.1-flash:xhigh
why synthesizer: openai-codex/gpt-6.1-sol:max
reflect tooling: openai-codex/gpt-6.1-sol:max
reflect judgment, divergent, synthesizer: openai-codex/gpt-6.1-sol:max
arena runners: openai-codex/gpt-6.1-sol:max, openai-codex/gpt-6-luna:max, opencode-go/mimo-v2.6-pro:high, opencode-go/deepseek-v4.1-flash:xhigh
arena cross-judge pool: openai-codex/gpt-6.1-sol:max, opencode-go/mimo-v2.6-pro:high, opencode-go/deepseek-v4.1-flash:xhigh, vercel-ai-gateway/zai/glm-5.3:high
swarm workers: openai-codex/gpt-6-luna:max
architect runners: openai-codex/gpt-6.1-sol:max, openai-codex/gpt-6-luna:max, opencode-go/mimo-v2.6-pro:high, opencode-go/deepseek-v4.1-flash:xhigh
interrogate reviewers: openai-codex/gpt-6.1-sol:max, openai-codex/gpt-6-luna:max, opencode-go/deepseek-v4.1-flash:xhigh, vercel-ai-gateway/zai/glm-5.3:high
