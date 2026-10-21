# Todd mode model configuration, maintained by hand. One line per role. Todd mode reads only this file; ~/.agents/pstack-models.md does not apply.
# `inherit-parent` or `auto` runs on the parent chat model (omit the subagent `model`). Alias entries in a panel list still count toward its fan-out.
# budget: unlimited (max); explicit per-role efforts below take precedence.
# Pi model values use provider/id:effort; the effort suffix is a subagent reasoning override, not part of the registry model ID.
# DeepSeek uses :max with the current registered thinkingLevelMap.
# Gateway Muse and GLM use Pi's generic Anthropic thinking budget for :high.
# Fallback policy: if a primary model is unavailable because of authentication, quota, rate limits, provider outage, or model resolution failure, retry the affected role with its fallback below and report the switch. Do not switch for task/tool failures or silently lower reasoning.
# Apply fallbacks to every occurrence, including panel entries. Preserve the panel count. These are agent instructions, not provider-side automatic failover.
# fallback: opencode-go/deepseek-v4.1-flash:max -> openai-codex/gpt-6-luna:max
# fallback: opencode-go/glm-5.3-flash:high -> vercel-ai-gateway/zai/glm-5.3-flash:high
# fallback: claude-bridge/claude-opus-5-5:high -> openai-codex/gpt-6-astra:high
# fallback: claude-bridge/claude-sonnet-5-5:high -> openai-codex/gpt-6.1-sol:high
feature, refactoring: opencode-go/deepseek-v4.1-flash:max
code-simplifier: opencode-go/deepseek-v4.1-flash:max
bug-fix: claude-bridge/claude-sonnet-5-5:high
perf-issue: opencode-go/deepseek-v4.1-flash:max
hillclimb: opencode-go/deepseek-v4.1-flash:max
judgment and prose: claude-bridge/claude-opus-5-5:high
hardest tasks: claude-bridge/claude-fable-5-1
runtime verification: opencode-go/deepseek-v4.1-flash:max
e2e verification: opencode-go/deepseek-v4.1-flash:max
how explorer: opencode-go/deepseek-v4.1-flash:max
how explainer: openai-codex/gpt-6-astra:high
why investigators: opencode-go/deepseek-v4.1-flash:max
why synthesizer: openai-codex/gpt-6-astra:high
reflect tooling: claude-bridge/claude-opus-5-5:high
reflect judgment, divergent, synthesizer: openai-codex/gpt-6-astra:high
arena runners: opencode-go/deepseek-v4.1-flash:max, opencode-go/deepseek-v4.1-flash:max, openai-codex/gpt-6-luna:max
arena cross-judge pool: claude-bridge/claude-opus-5-5:high
swarm workers: opencode-go/deepseek-v4.1-flash:max
architect runners: openai-codex/gpt-6-astra:high, claude-bridge/claude-sonnet-5-5:high
interrogate reviewers: claude-bridge/claude-opus-5-5:high, openai-codex/gpt-6-astra:high
