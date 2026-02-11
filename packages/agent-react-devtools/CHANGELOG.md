# agent-react-devtools

## 0.2.2

### Patch Changes

- 370ef23: fix: prevent race condition where React loads before devtools hook is installed

  The connect module's dynamic `import('react-devtools-core')` yielded control before `initialize()` could install the hook, allowing react-dom to load first and miss the connection. Added top-level `await` to block dependent modules until the hook is ready, and updated the Vite plugin to enable `top-level-await` in esbuild's dep optimizer.

## 0.2.1

### Patch Changes

- 0c2de5b: Add Claude Code skill and plugin marketplace metadata

## 0.2.0

### Minor Changes

- 0c88c11: Zero-config app integration — connect your React app in one line:

  - **`agent-react-devtools init`** — CLI command that auto-detects your framework (Vite, Next.js, CRA, React Native) and patches the right config files. Next.js App Router gets a `'use client'` wrapper so the connect code runs in the browser.
  - **`agent-react-devtools/connect`** — add `import 'agent-react-devtools/connect'` as the first line of your entry point to connect to the daemon. Skips SSR and production builds automatically, never blocks your app.
  - **`agent-react-devtools/vite`** — Vite plugin that injects the connect script automatically, no app code changes needed.

### Patch Changes

- 10ac53c: Add comprehensive README with usage examples and MIT LICENSE file

## 0.1.0

### Minor Changes

- d1e02f9: **Daemon, DevTools bridge, and component tree**

  **Daemon** — Persistent background process with IPC server (Unix socket) that manages connections and dispatches commands.

  **DevTools Bridge** — WebSocket server implementing the React DevTools "Wall" protocol. Connects to running React apps via `react-devtools-core`.

  **Component Tree** — Parse and inspect the full React component hierarchy:

  - View component tree with types, keys, and parent/child relationships
  - Inspect props, state, and hooks of any component
  - Search components by display name (fuzzy or exact match)
  - Count components by type

  **CLI** — Command-line interface with commands: `start`, `stop`, `status`, `tree`, `find`, `count`, `get component`.

  **Formatting** — Token-efficient output designed for LLM consumption.

- 626a21a: **Profiler**

  Start and stop profiling sessions to capture render performance data from connected React apps.

  - **Render reports** — Per-component render duration and count
  - **Slowest components** — Ranked by self render time
  - **Most re-rendered** — Ranked by render count
  - **Commit timeline** — Chronological view of React commits with durations
  - **Commit details** — Per-component breakdown for a specific commit, sorted by self time

  CLI commands: `profile start`, `profile stop`, `profile report`, `profile slow`, `profile rerenders`, `profile timeline`, `profile commit`.
