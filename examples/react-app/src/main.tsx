import { initialize, connectToDevTools } from 'react-devtools-core';
import { StrictMode } from 'react';

// Vite's React Refresh preamble installs a minimal DevTools hook stub
// that lacks rendererInterfaces and a proper inject(). Remove it so
// initialize() can install the full hook from react-devtools-core.
// This must happen before react-dom loads (hence the dynamic import below).
try {
  delete (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
} catch {
  // ignore — property may be non-configurable (browser extension)
}

initialize();

async function main() {
  // Connect to the DevTools daemon and wait for the backend to
  // initialize before loading React. connectToDevTools sets ws.onopen
  // which runs initBackend (subscribes to hook operations). We must
  // wait for that before React renders, otherwise the first render's
  // operations are lost and the component tree appears empty.
  await new Promise<void>((resolve) => {
    try {
      const ws = new WebSocket('ws://localhost:8097');
      connectToDevTools({ port: 8097, websocket: ws });
      // addEventListener fires after the onopen property handler,
      // so initBackend has already run by the time we resolve.
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', () => resolve());
      setTimeout(resolve, 2000); // don't block app if daemon isn't running
    } catch {
      resolve();
    }
  });

  const { createRoot } = await import('react-dom/client');
  const { default: App } = await import('./App');

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

main();
