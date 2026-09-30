# pstack model configuration. One line per role. Delete a line to fall back to the skill default.
# `inherit-parent` or `auto` runs on the parent chat model (omit the subagent `model`). Alias entries in a panel list still count toward its fan-out.
# budget: medium (high)
# Pi model values use provider/id:high; :high is the subagent reasoning override, not part of the registry model ID.
feature, refactoring: opencode-go/mimo-v2.6-pro:high
bug-fix: opencode-go/mimo-v2.6-pro:high
perf-issue: opencode-go/mimo-v2.6-pro:high
hillclimb: opencode-go/mimo-v2.6-pro:high
judgment and prose: openai-codex/gpt-6.1-sol:high
hardest tasks: openai-codex/gpt-6.1-sol:high
how explorer: opencode-go/deepseek-v4.1-flash:high
how explainer: openai-codex/gpt-6.1-sol:high
why investigators: opencode-go/deepseek-v4.1-flash:high
why synthesizer: openai-codex/gpt-6.1-sol:high
reflect tooling: openai-codex/gpt-6.1-sol:high
reflect judgment, divergent, synthesizer: openai-codex/gpt-6.1-sol:high
arena runners: openai-codex/gpt-6.1-sol:high, opencode-go/mimo-v2.6-pro:high, opencode-go/deepseek-v4.1-flash:high, deepinfra/zai-org/GLM-5.3:high
arena cross-judge pool: openai-codex/gpt-6.1-sol:high, opencode-go/mimo-v2.6-pro:high, opencode-go/deepseek-v4.1-flash:high, deepinfra/zai-org/GLM-5.3:high
swarm workers: opencode-go/mimo-v2.6-pro:high
architect runners: openai-codex/gpt-6.1-sol:high, opencode-go/mimo-v2.6-pro:high, opencode-go/deepseek-v4.1-flash:high, deepinfra/zai-org/GLM-5.3:high
interrogate reviewers: openai-codex/gpt-6.1-sol:high, opencode-go/mimo-v2.6-pro:high, opencode-go/deepseek-v4.1-flash:high, deepinfra/zai-org/GLM-5.3:high
