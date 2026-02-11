/**
 * Browser-side connection module for agent-react-devtools.
 *
 * Usage: `import 'agent-react-devtools/connect'`
 *
 * This must be imported before React loads. It:
 * 1. Removes the Vite plugin-react hook stub
 * 2. Initializes react-devtools-core (installs the real __REACT_DEVTOOLS_GLOBAL_HOOK__)
 * 3. Connects via WebSocket to the agent-react-devtools daemon
 *
 * Steps 1–2 run synchronously at module evaluation time via a static import
 * of react-devtools-core. This is critical — a dynamic import would yield
 * control and let React load before the hook is installed. The static import
 * also ensures esbuild's CJS-to-ESM interop provides proper named exports
 * (dynamic imports to CJS chunks only expose a default export).
 *
 * react-devtools-core is a required peer dependency. If not installed, this
 * module will fail to load — which is the correct behavior since there's
 * nothing useful it can do without it.
 *
 * Export `ready` — a promise that resolves once the WebSocket opens
 * (or after a 2s timeout / error, so the app is never blocked).
 */

import { initialize, connectToDevTools } from 'react-devtools-core';

function getMeta(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const meta = document.querySelector(`meta[name="${name}"]`);
  return meta?.getAttribute('content') || null;
}

function getPort(): number {
  const val = parseInt(getMeta('agent-react-devtools-port') || '', 10);
  return isNaN(val) ? 8097 : val;
}

function getHost(): string {
  return getMeta('agent-react-devtools-host') || 'localhost';
}

function noop(): Promise<void> {
  return Promise.resolve();
}

// SSR guard
const isSSR = typeof window === 'undefined';

// Production guard — check bundler-injected signals first, then Node.js process.env
const isProd =
  (typeof import.meta !== 'undefined' &&
    (import.meta as any).env?.PROD === true) ||
  (typeof process !== 'undefined' &&
    process.env?.NODE_ENV === 'production');

// Install the devtools hook synchronously before React loads.
// This MUST happen at module evaluation time — if deferred to an async
// callback, react-dom may initialize first and miss the hook entirely.
if (!isSSR && !isProd) {
  // Remove Vite's plugin-react hook stub so react-devtools-core can install the full hook
  try {
    delete (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  } catch {
    // Property may be non-configurable (browser extension) — ignore
  }

  initialize();
}

export const ready: Promise<void> = isSSR || isProd ? noop() : connect();

function connect(): Promise<void> {
  try {
    const port = getPort();
    const host = getHost();

    return new Promise<void>((resolve) => {
      try {
        const ws = new WebSocket(`ws://${host}:${port}`);
        connectToDevTools({ port, websocket: ws });
        ws.addEventListener('open', () => resolve());
        ws.addEventListener('error', () => resolve());
        setTimeout(resolve, 2000);
      } catch {
        resolve();
      }
    });
  } catch {
    return Promise.resolve();
  }
}
