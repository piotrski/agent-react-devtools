---
"agent-react-devtools": minor
---

Smart tree truncation for large component trees

Large React apps (500-2000+ components) now produce much smaller `get tree` output:

- **Host filtering by default**: `<div>`, `<span>`, and other host components are hidden (use `--all` to show them). Host components with keys or custom element names are always shown.
- **Sibling collapsing**: When a parent has many children with the same display name (e.g. list items), only the first 3 are shown with a `... +N more ComponentName` summary.
- **Summary footer**: Output ends with `N components shown (M total)` so the agent knows how much was filtered.
- **`--max-lines N` flag**: Hard cap on output lines to stay within context budgets.
