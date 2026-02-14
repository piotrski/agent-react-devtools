---
"agent-react-devtools": minor
---

Add `wait` command

- `wait --connected` — block until a React app connects
- `wait --component <name>` — block until a named component appears in the tree
- Both support `--timeout` (default 30s) and exit non-zero on timeout
