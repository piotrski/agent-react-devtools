---
"agent-react-devtools": minor
---

Zero-config app integration — connect your React app in one line:

- **`agent-react-devtools init`** — CLI command that auto-detects your framework (Vite, Next.js, CRA, React Native) and patches the right config files. Next.js App Router gets a `'use client'` wrapper so the connect code runs in the browser.
- **`agent-react-devtools/connect`** — add `import 'agent-react-devtools/connect'` as the first line of your entry point to connect to the daemon. Skips SSR and production builds automatically, never blocks your app.
- **`agent-react-devtools/vite`** — Vite plugin that injects the connect script automatically, no app code changes needed.
