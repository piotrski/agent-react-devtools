---
"agent-react-devtools": minor
---

Surface specific changed prop/state/hook keys in profiling output

Profiling reports and commit details now show *which* props, state keys, and hooks changed, not just *that* they changed.

- `profile report` and `profile slow` append `changed: props: onClick, className  state: count` lines
- `profile rerenders` and `profile commit` include the same detail per component
- Keys are deduplicated across commits in aggregate reports
- Empty keys produce no extra output (backward-compatible)
