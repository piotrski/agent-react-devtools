# Expo Example App

A minimal React Native app using Expo to test `agent-react-devtools` integration.

## Setup

```sh
cd examples/expo-app
bun install
```

## Testing the DevTools Connection

React Native apps connect to React DevTools automatically — no code changes needed.

```sh
# Terminal 1: Start the daemon
agent-react-devtools start

# Terminal 2: Start the Expo dev server
cd examples/expo-app
bun start

# Terminal 3: Inspect the app
agent-react-devtools status
agent-react-devtools get tree
```

### Physical devices

Forward the DevTools port over USB:

```sh
adb reverse tcp:8097 tcp:8097
```

### Custom port

Set the `REACT_DEVTOOLS_PORT` environment variable before starting both the daemon and the app.
