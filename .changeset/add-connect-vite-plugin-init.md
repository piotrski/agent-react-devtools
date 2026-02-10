---
"agent-react-devtools": minor
---

Add connect script, Vite plugin, and init command for zero-config app integration

- `agent-react-devtools/connect`: side-effect import that initializes react-devtools-core and connects via WebSocket, with SSR/production guards and graceful fallback
- `agent-react-devtools/vite`: Vite plugin that injects the connect script automatically
- `agent-react-devtools init`: CLI command that auto-detects framework (Vite, Next.js, CRA, React Native) and patches config files
- Next.js App Router support: creates a `'use client'` wrapper file instead of patching the server-only layout
- Expo example app
