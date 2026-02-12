# agent-react-devtools

Give your AI agent eyes into your React app. Inspect component trees, read props and state, and profile rendering performance — all from the command line. Inspired by Vercel's [agent-browser](https://github.com/vercel-labs/agent-browser) and Callstack's [agent-device](https://github.com/callstackincubator/agent-device).

The project is in early development and considered experimental. Pull requests are welcome!

## Features

- Walk the full component tree with props, state, and hooks
- Search for components by display name
- Profile renders: find slow components, excessive re-renders, and commit timelines
- Persistent background daemon that survives across CLI calls
- Token-efficient output built for LLM consumption

## Install

```sh
npm install -g agent-react-devtools
```

Or run it directly:

```sh
npx agent-react-devtools start
```

## Quick Start

```sh
agent-react-devtools start
agent-react-devtools status
```

```
Daemon: running (port 8097)
Apps: 1 connected, 24 components
Uptime: 12s
```

Browse the component tree:

```sh
agent-react-devtools get tree --depth 3
```

```
@c1 [fn] App
├─ @c2 [fn] Header
│  ├─ @c3 [fn] Nav
│  └─ @c4 [fn] SearchBar
├─ @c5 [fn] TodoList
│  ├─ @c6 [fn] TodoItem key=1
│  ├─ @c7 [fn] TodoItem key=2
│  └─ @c8 [fn] TodoItem key=3
└─ @c9 [fn] Footer
```

Inspect a component's props, state, and hooks:

```sh
agent-react-devtools get component @c6
```

```
@c6 [fn] TodoItem key=1
props:
  id: 1
  text: "Buy groceries"
  done: false
  onToggle: ƒ
hooks:
  State: false
  Callback: ƒ
```

Find components by name:

```sh
agent-react-devtools find TodoItem
```

```
@c6 [fn] TodoItem key=1
@c7 [fn] TodoItem key=2
@c8 [fn] TodoItem key=3
```

Profile rendering performance:

```sh
agent-react-devtools profile start
# ... interact with the app ...
agent-react-devtools profile stop
agent-react-devtools profile slow
```

```
Slowest (by avg render time):
  @c5 [fn] TodoList  avg:4.2ms  max:8.1ms  renders:6  causes:props-changed
  @c4 [fn] SearchBar  avg:2.1ms  max:3.4ms  renders:12  causes:hooks-changed
  @c2 [fn] Header  avg:0.8ms  max:1.2ms  renders:3  causes:parent-rendered
```

## Commands

### Daemon

```sh
agent-react-devtools start [--port 8097]   # Start daemon
agent-react-devtools stop                   # Stop daemon
agent-react-devtools status                 # Connection status
```

### Components

```sh
agent-react-devtools get tree [--depth N]          # Component hierarchy
agent-react-devtools get component <@c1 | id>      # Props, state, hooks
agent-react-devtools find <name> [--exact]          # Search by display name
agent-react-devtools count                          # Component count by type
```

Components are labeled `@c1`, `@c2`, etc. You can use these labels or numeric IDs interchangeably.

### Profiling

```sh
agent-react-devtools profile start [name]           # Begin a profiling session
agent-react-devtools profile stop                    # Stop and collect data
agent-react-devtools profile report <@c1 | id>      # Render report for a component
agent-react-devtools profile slow [--limit N]        # Slowest components by avg duration
agent-react-devtools profile rerenders [--limit N]   # Most re-rendered components
agent-react-devtools profile timeline [--limit N]    # Commit timeline
agent-react-devtools profile commit <N | #N> [--limit N]  # Single commit detail
```

## Connecting Your App

### Quick setup

Run the init command in your project root to auto-configure your framework:

```sh
npx agent-react-devtools init
```

This detects your framework (Vite, Next.js, CRA) and patches the appropriate config file.

### One-line import

Add a single import as the first line of your entry point (e.g. `src/main.tsx`):

```ts
import "agent-react-devtools/connect";
```

This handles everything: deleting the Vite hook stub, initializing react-devtools-core, and connecting via WebSocket. Your app is never blocked — if the daemon isn't running, it times out after 2 seconds.

### Vite plugin

For Vite apps, use the plugin instead — no changes to your app code needed:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { reactDevtools } from "agent-react-devtools/vite";

export default defineConfig({
  plugins: [reactDevtools(), react()],
});
```

The plugin only runs in dev mode (`vite dev`), not in production builds.

Options:

```ts
reactDevtools({ port: 8097, host: "localhost" });
```

### React Native

React Native apps connect to DevTools automatically — no code changes needed:

```sh
agent-react-devtools start
npx react-native start
```

For physical devices, forward the port:

```sh
adb reverse tcp:8097 tcp:8097
```

For Expo, the connection works automatically with the Expo dev client.

To use a custom port, set the `REACT_DEVTOOLS_PORT` environment variable.

## Using with agent-browser

When using `agent-browser` to drive the app (e.g. for profiling interactions), you **must use headed mode**. Headless Chromium does not properly execute the devtools connect script:

```sh
agent-browser --session devtools --headed open http://localhost:5173/
agent-react-devtools status  # Should show "Apps: 1 connected"
```

## Using with AI Coding Assistants

Add the skill to your AI coding assistant for richer context:

```sh
npx skills add piotrski/agent-react-devtools
```

This works with Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, Goose, OpenCode, and Windsurf.

### Claude Code plugin

You can also install via the Claude Code plugin marketplace:

```
/plugin marketplace add piotrski/agent-react-devtools
/plugin install agent-react-devtools@piotrski
```

### Manual setup

Alternatively, add something like this to your project's `CLAUDE.md` (or equivalent agent instructions):

```markdown
## React Debugging

This project uses agent-react-devtools to inspect the running React app.

- `agent-react-devtools start` — start the daemon
- `agent-react-devtools status` — check if the app is connected
- `agent-react-devtools get tree` — see the component hierarchy
- `agent-react-devtools get component @c1` — inspect a specific component
- `agent-react-devtools find <Name>` — search for components
- `agent-react-devtools profile start` / `profile stop` / `profile slow` — diagnose render performance
```

## Development

```sh
bun install        # Install dependencies
bun run build      # Build
bun run test       # Run tests
bun run typecheck  # Type check
```

## License

MIT
