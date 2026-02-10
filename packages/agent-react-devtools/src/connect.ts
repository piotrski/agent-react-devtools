/**
 * Browser-side connection module for agent-react-devtools.
 *
 * Usage: `import 'agent-react-devtools/connect'`
 *
 * This must be imported before React loads. It:
 * 1. Removes the Vite plugin-react hook stub
 * 2. Initializes react-devtools-core
 * 3. Connects via WebSocket to the agent-react-devtools daemon
 *
 * Export `ready` — a promise that resolves once the WebSocket opens
 * (or after a 2s timeout / error, so the app is never blocked).
 */

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

// Production guard
const isProd =
  typeof process !== 'undefined' &&
  process.env &&
  process.env.NODE_ENV === 'production';

export const ready: Promise<void> = isSSR || isProd ? noop() : connect();

async function connect(): Promise<void> {
  const port = getPort();
  const host = getHost();

  // Remove Vite's plugin-react hook stub so react-devtools-core can install the full hook
  try {
    delete (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  } catch {
    // Property may be non-configurable (browser extension) — ignore
  }

  const { initialize, connectToDevTools } = await import('react-devtools-core');
  initialize();

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
}
