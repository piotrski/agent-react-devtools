---
"agent-react-devtools": patch
---

Fixed Vite HMR (hot module replacement) breaking when the `reactDevtools()` plugin is added to `vite.config.ts`. The connect module now preserves the react-refresh runtime's inject wrapper when replacing the devtools hook, so both Fast Refresh and devtools inspection work correctly.
