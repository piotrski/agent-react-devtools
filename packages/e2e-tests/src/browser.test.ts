import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import {
  createTempStateDir,
  getTestPort,
  startDaemon,
  waitForDaemon,
  stopDaemon,
  sendIpcCommand,
  sleep,
} from './helpers.js';
import { startViteServer, stopViteServer } from './vite-server.js';

describe('Browser e2e', () => {
  let stateDir: string;
  let port: number;
  let vitePort: number;
  let daemon: ChildProcess | null = null;
  let viteProcess: ChildProcess | null = null;
  let browser: Browser;
  let page: Page;
  let socketPath: string;

  beforeAll(async () => {
    // 1. Start daemon on a random port
    stateDir = createTempStateDir();
    port = getTestPort();
    daemon = startDaemon(port, stateDir);
    await waitForDaemon(stateDir);
    socketPath = path.join(stateDir, 'daemon.sock');

    // 2. Start Vite dev server on a random port pointing to our daemon
    vitePort = getTestPort();
    viteProcess = await startViteServer(vitePort, port);

    // 3. Launch browser and navigate to app
    browser = await chromium.launch();
    page = await browser.newPage();

    await page.goto(`http://localhost:${vitePort}/`);
    await page.waitForLoadState('networkidle');

    // 4. Wait for React app to connect and send component tree
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const resp = await sendIpcCommand(socketPath, { type: 'status' });
      const data = resp.data as { connectedApps: number; componentCount: number };
      if (data.connectedApps > 0 && data.componentCount > 0) break;
      await sleep(500);
    }
  }, 60_000);

  afterAll(async () => {
    if (page) await page.close();
    if (browser) await browser.close();
    if (viteProcess) await stopViteServer(viteProcess);
    await stopDaemon(daemon, stateDir);
  });

  it('connects to the real React app', async () => {
    const resp = await sendIpcCommand(socketPath, { type: 'status' });
    expect(resp.ok).toBe(true);
    const data = resp.data as { connectedApps: number; componentCount: number };
    expect(data.connectedApps).toBeGreaterThanOrEqual(1);
    expect(data.componentCount).toBeGreaterThan(0);
  });

  it('get-tree returns real component hierarchy', async () => {
    const resp = await sendIpcCommand(socketPath, { type: 'get-tree' });
    expect(resp.ok).toBe(true);
    const nodes = resp.data as Array<{ displayName: string; type: string; label: string }>;
    expect(nodes.length).toBeGreaterThan(5);

    const names = nodes.map((n) => n.displayName);
    expect(names).toContain('App');
    expect(names).toContain('LiveClock');

    // All nodes should have labels
    for (const node of nodes) {
      expect(node.label).toMatch(/^@c\d+$/);
    }
  });

  it('find returns real components', async () => {
    const resp = await sendIpcCommand(socketPath, { type: 'find', name: 'ChatMessage' });
    expect(resp.ok).toBe(true);
    const results = resp.data as Array<{ displayName: string; type: string }>;
    expect(results.length).toBeGreaterThan(0);
    // ChatMessage is defined with memo() but React 19 may report it as 'function'
    expect(['memo', 'function']).toContain(results[0].type);
  });

  it('count returns real type breakdown', async () => {
    const resp = await sendIpcCommand(socketPath, { type: 'count' });
    expect(resp.ok).toBe(true);
    const counts = resp.data as Record<string, number>;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(5);
  });

  it('profile a real interaction', async () => {
    // Start profiling
    const startResp = await sendIpcCommand(socketPath, { type: 'profile-start', name: 'browser-e2e' });
    expect(startResp.ok).toBe(true);

    // Trigger a real interaction — click the theme toggle button
    await page.click('button:has-text("Toggle theme")');
    await sleep(500);

    // Stop profiling
    const stopResp = await sendIpcCommand(socketPath, { type: 'profile-stop' });
    expect(stopResp.ok).toBe(true);
    const summary = stopResp.data as {
      name: string;
      commitCount: number;
      componentRenderCounts: Array<{ displayName: string; count: number }>;
    };
    expect(summary.name).toBe('browser-e2e');
    expect(summary.commitCount).toBeGreaterThan(0);
    expect(summary.componentRenderCounts.length).toBeGreaterThan(0);
  });
});
