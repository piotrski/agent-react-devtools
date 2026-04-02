---
"agent-react-devtools": minor
---

Add `uninit` command to reverse framework configuration

`agent-react-devtools uninit` removes the changes made by `init` — restoring your config files to their original state.

- Supports all frameworks: Vite, Next.js (Pages Router and App Router), CRA
- `--dry-run` flag previews what would be removed without writing any files
- Safe to run on projects not configured by `init` (no-op)
