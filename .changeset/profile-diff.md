---
"agent-react-devtools": minor
---

Add `profile diff <before.json> <after.json>` command

- Compares two profiling exports side by side
- Shows regressed, improved, new, and removed components
- Aggregates by display name, computes avg/max duration deltas
- Configurable threshold filters noise from insignificant changes (default 5%, adjust with `--threshold`)
- No daemon required - works purely on exported JSON files
