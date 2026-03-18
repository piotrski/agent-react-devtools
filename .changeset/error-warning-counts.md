---
"agent-react-devtools": minor
---

Track and expose component error/warning counts

Components now track error and warning counts from the React DevTools protocol (`UPDATE_ERRORS_OR_WARNINGS` operations).

- New `errors` command lists components with non-zero error or warning counts
- `get component` output includes error/warning counts when non-zero
- Tree, search, and component output annotates affected components (e.g., `@c5 [fn] Form ⚠2 ✗1`)
