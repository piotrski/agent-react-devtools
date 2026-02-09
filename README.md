# agent-react-devtools

CLI tool and MCP server for AI agents to inspect React component trees and profile rendering performance. Connects to running React apps via the React DevTools protocol.

## Features

- **Component tree** — View the full React component hierarchy with types, keys, and parent/child relationships
- **Component inspection** — Inspect props, state, and hooks of any component
- **Search** — Find components by display name (fuzzy or exact match)
- **Profiling** — Start/stop profiling sessions, get per-component render reports, find slowest components, most re-rendered components, and commit timelines
- **MCP server** — Expose all functionality as MCP tools for AI agent integration
- **Token-efficient output** — Compact formatting designed for LLM consumption

## Architecture

```
CLI / MCP Server
      |
   IPC (Unix socket)
      |
   Daemon (persistent process)
      |
   WebSocket (port 8097)
      |
   React App (via react-devtools-core)
```

The daemon runs as a background process and maintains a WebSocket server that React apps connect to using the React DevTools "Wall" protocol. The CLI and MCP server communicate with the daemon over IPC.

## CLI Usage

```sh
# Start the daemon
agent-react-devtools start [--port 8097]

# Check connection status
agent-react-devtools status

# View component tree
agent-react-devtools get tree [--depth N]

# Inspect a component (by label or ID)
agent-react-devtools get component @c1

# Search for components
agent-react-devtools find Button [--exact]

# Component count by type
agent-react-devtools count

# Profiling
agent-react-devtools profile start [session-name]
agent-react-devtools profile stop
agent-react-devtools profile report @c1
agent-react-devtools profile slow [--limit N]
agent-react-devtools profile rerenders [--limit N]
agent-react-devtools profile timeline [--limit N]

# MCP server (stdio transport)
agent-react-devtools serve-mcp

# Stop the daemon
agent-react-devtools stop
```

## Connecting a React App

Add `react-devtools-core` to your app and initialize before React loads:

```ts
import { initialize, connectToDevTools } from 'react-devtools-core';

initialize();
connectToDevTools({ port: 8097 });
```

## Development

```sh
# Install dependencies
bun install

# Build
bun run build

# Run tests
bun run test

# Type check
bun run typecheck
```

## License

MIT
