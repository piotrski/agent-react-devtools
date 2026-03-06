---
"agent-react-devtools": minor
---

Add `profile diff <before.json> <after.json>` command

- Compares two profiling exports side by side
- Shows regressed, improved, new, and removed components
- Aggregates by display name, computes avg/max duration deltas
- 5% threshold filters noise from insignificant changes
- No daemon required - works purely on exported JSON files
