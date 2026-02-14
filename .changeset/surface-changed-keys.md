---
"agent-react-devtools": minor
---

feat: surface specific changed prop/state/hook keys in profiling output

Add `ChangedKeys` interface carrying the specific changed keys (props, state, hooks) alongside cause type strings in `ComponentRenderReport` and `CommitDetail`. This makes profiling output more actionable — agents now see *which* props/state/hooks changed, not just *that* they changed. Keys are deduplicated across commits and displayed in all profiling formatters.
