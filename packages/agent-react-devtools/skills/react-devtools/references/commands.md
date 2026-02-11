# Command Reference

## Daemon Management

### `agent-react-devtools start [--port N]`
Start the background daemon. Default port: 8097. The daemon listens for WebSocket connections from React apps and IPC connections from the CLI. Auto-starts when you run any other command, so you rarely need this explicitly.

### `agent-react-devtools stop`
Stop the daemon process. All connection state is lost.

### `agent-react-devtools status`
Show daemon status: port, connected apps, component count, profiling state, uptime.

Output:
```
Daemon: running (port 8097)
Apps: 1 connected, 42 components
Uptime: 120s
```

If profiling is active, shows `Profiling: active`.

## Component Inspection

### `agent-react-devtools get tree [--depth N]`
Print the component hierarchy as an indented tree. Each node shows:
- Label (`@c1`, `@c2`, ...) — stable within a session, resets on app reload
- Type tag (`fn`, `cls`, `host`, `memo`, `fRef`, `susp`, `ctx`)
- Display name
- Key (if present)

Use `--depth N` to limit tree depth. Recommended for large apps.

### `agent-react-devtools get component <@cN | id>`
Inspect a single component. Shows:
- **props** — all prop values (functions shown as `ƒ`, long values truncated at 60 chars)
- **state** — state values (class components and useState)
- **hooks** — all hooks with current values and sub-hooks

Accepts a label (`@c5`) or numeric React fiber ID.

### `agent-react-devtools find <name> [--exact]`
Search components by display name. Default is case-insensitive substring match. Use `--exact` for exact match.

Returns a flat list of matching components with labels, types, and keys.

### `agent-react-devtools count`
Count components by type. Output: `42 components (fn:25 host:12 memo:3 cls:2)`.

## Profiling

### `agent-react-devtools profile start [name]`
Start a profiling session. Optional name for identification. Only one session can be active at a time.

### `agent-react-devtools profile stop`
Stop profiling and collect data from React. Shows a summary with duration, commit count, and top rendered components.

### `agent-react-devtools profile slow [--limit N]`
Rank components by average render duration (slowest first). Default limit: 10.

Output columns: component name, avg duration, max duration, render count, primary cause.

### `agent-react-devtools profile rerenders [--limit N]`
Rank components by render count (most re-renders first). Default limit: 10.

Output columns: component name, render count, primary cause.

### `agent-react-devtools profile report <@cN | id>`
Detailed render report for a single component: render count, avg/max/total duration, all render causes.

### `agent-react-devtools profile timeline [--limit N]`
Chronological list of React commits during the profiling session. Each entry: index, duration, component count.

### `agent-react-devtools profile commit <N | #N> [--limit N]`
Detail for a specific commit by index. Shows per-component self/total duration and render causes.

## Setup

### `agent-react-devtools init [--dry-run]`
Auto-detect the framework in the current directory and configure the devtools connection. Supports Vite, Next.js, CRA, and Expo/React Native.

Use `--dry-run` to preview changes without writing files.
