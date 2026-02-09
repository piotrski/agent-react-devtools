# agent-react-devtools

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
