---
"agent-react-devtools": patch
---

Fix `init` command for Next.js App Router (create `'use client'` wrapper instead of patching server-only layout), always include `react-devtools-core` in install instructions, fix production guard in connect module for browser environments, and fix dry-run output when already configured
