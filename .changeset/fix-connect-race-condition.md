---
"agent-react-devtools": patch
---

fix: prevent race condition where React loads before devtools hook is installed

The connect module's dynamic `import('react-devtools-core')` yielded control before `initialize()` could install the hook, allowing react-dom to load first and miss the connection. Added top-level `await` to block dependent modules until the hook is ready, and updated the Vite plugin to enable `top-level-await` in esbuild's dep optimizer.
