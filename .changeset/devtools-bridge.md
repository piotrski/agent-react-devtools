---
"agent-react-devtools": minor
---

**Daemon, DevTools bridge, and component tree**

**Daemon** — Persistent background process with IPC server (Unix socket) that manages connections and dispatches commands.

**DevTools Bridge** — WebSocket server implementing the React DevTools "Wall" protocol. Connects to running React apps via `react-devtools-core`.

**Component Tree** — Parse and inspect the full React component hierarchy:
- View component tree with types, keys, and parent/child relationships
- Inspect props, state, and hooks of any component
- Search components by display name (fuzzy or exact match)
- Count components by type

**CLI** — Command-line interface with commands: `start`, `stop`, `status`, `tree`, `find`, `count`, `get component`.

**Formatting** — Token-efficient output designed for LLM consumption.
