# Profiling Guide

## Quick Start

```bash
agent-react-devtools profile start
# Trigger the slow interaction (type, click, navigate)
agent-react-devtools profile stop
agent-react-devtools profile slow --limit 5
```

## Step-by-Step Workflow

### 1. Establish a Baseline

Before profiling, check the current state:

```bash
agent-react-devtools status          # Confirm app is connected
agent-react-devtools count           # How many components are mounted
agent-react-devtools get tree --depth 3  # Understand the structure
```

### 2. Profile the Interaction

Start profiling, then trigger the specific interaction the user reports as slow:

```bash
agent-react-devtools profile start "typing in search"
```

The user should perform the interaction now. If using agent-browser, you can drive the interaction programmatically.

```bash
agent-react-devtools profile stop
```

### 3. Identify Bottlenecks

**Slowest components** — which components take the most time per render:
```bash
agent-react-devtools profile slow --limit 5
```

**Most re-rendered** — which components render too often:
```bash
agent-react-devtools profile rerenders --limit 5
```

These two views complement each other:
- A component that renders 100 times at 0.1ms each = 10ms total (re-render problem)
- A component that renders 2 times at 50ms each = 100ms total (slow render problem)

### 4. Drill Into Specific Components

Once you identify a suspect, get its full render report:

```bash
agent-react-devtools profile report @c12
```

This shows all render causes. Common patterns:

| Cause | Meaning | Typical Fix |
|-------|---------|-------------|
| `parent-rendered` | Parent re-rendered, child has no bailout | Wrap child in `React.memo()` |
| `props-changed` | Received new prop references | Stabilize with `useMemo`/`useCallback` in parent |
| `state-changed` | Component's own state changed | Check if state update is necessary |
| `hooks-changed` | A hook dependency changed | Review hook dependencies |
| `first-mount` | Initial render | Normal — not a problem |

### 5. Inspect the Component

Read the component's current props and hooks to understand what's changing:

```bash
agent-react-devtools get component @c12
```

Look for:
- Function props (`ƒ`) — likely unstable references if not wrapped in `useCallback`
- Object/array props — likely new references if not wrapped in `useMemo`
- State that updates too frequently

### 6. Fix and Verify

After applying the fix, re-profile with the same interaction:

```bash
agent-react-devtools profile start "after fix"
# Same interaction
agent-react-devtools profile stop
agent-react-devtools profile slow --limit 5
```

Compare render counts and durations to confirm improvement.

## Common Performance Issues

### Cascading re-renders from context or lifted state
A parent component re-renders (e.g., from a timer or context change) and all children re-render because none use `React.memo`. Look for high re-render counts with `parent-rendered` cause.

### Unstable prop references
Parent passes `onClick={() => ...}` or `style={{...}}` inline — creates new references every render, defeating `memo()`. The child shows `props-changed` as the cause even though the values are semantically identical.

### Expensive computations without memoization
A component does heavy work (filtering, sorting, formatting) on every render. Shows up as high avg render time. Fix with `useMemo`.

### State updates in effects causing render loops
An effect updates state on every render, causing unnecessary commit cycles. Look for unusually high commit counts in `profile timeline`.
