---
"agent-react-devtools": minor
---

Standardize component reference format across all CLI output

All formatters now produce consistent `@cN [type] Name` references. Previously, tree and search commands used `@c1 [fn] "Name"` while profiling commands omitted labels, type tags, or both.

**Breaking changes to output format:**

- Component names are no longer quoted: `@c1 [fn] App` instead of `@c1 [fn] "App"`
- Keys use `key=value` instead of `key="value"`
- Profiling commands (`profile slow`, `profile rerenders`, `profile stop`, `profile commit`) now include `@cN` labels and `[type]` tags
- `profile slow` and `profile rerenders` show all render causes instead of only the first
- `profile report` now includes a `[type]` tag in the header
- Column-aligned padding removed from profiling output in favor of consistent `formatRef` formatting
