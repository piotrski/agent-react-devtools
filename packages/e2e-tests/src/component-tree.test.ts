import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { WebSocket } from 'ws';
import {
  createTempStateDir,
  getTestPort,
  startDaemon,
  waitForDaemon,
  stopDaemon,
  sendIpcCommand,
  connectMockApp,
  sendOperations,
  buildAddOp,
  buildRemoveOp,
  sleep,
} from './helpers.js';

describe('Component tree (e2e)', () => {
  let stateDir: string;
  let port: number;
  let daemon: ChildProcess | null = null;
  let ws: WebSocket | null = null;
  let socketPath: string;

  beforeEach(async () => {
    stateDir = createTempStateDir();
    port = getTestPort();
    daemon = startDaemon(port, stateDir);
    await waitForDaemon(stateDir);
    socketPath = path.join(stateDir, 'daemon.sock');
    ws = await connectMockApp(port);
  });

  afterEach(async () => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    await stopDaemon(daemon, stateDir);
    daemon = null;
    ws = null;
  });

  it('should track components sent via WebSocket operations', async () => {
    // Simulate a React app sending operations
    const ops = [
      1, 100, // rendererID, rootFiberID
      ...buildAddOp(1, 2, 0, 'App'),
      ...buildAddOp(2, 7, 1, 'Header'),
      ...buildAddOp(3, 2, 1, 'Footer'),
    ];
    sendOperations(ws!, ops);

    // Give the daemon time to process
    await sleep(200);

    // Query the tree via IPC
    const resp = await sendIpcCommand(socketPath, { type: 'get-tree' });
    expect(resp.ok).toBe(true);

    const tree = resp.data as Array<{
      id: number;
      displayName: string;
      type: string;
      children: number[];
    }>;
    expect(tree).toHaveLength(3);
    expect(tree[0].displayName).toBe('App');
    expect(tree[0].children).toEqual([2, 3]);
  });

  it('should find components by name', async () => {
    const ops = [
      1, 100,
      ...buildAddOp(1, 2, 0, 'App'),
      ...buildAddOp(2, 2, 1, 'UserProfile'),
      ...buildAddOp(3, 7, 1, 'UserCard'),
      ...buildAddOp(4, 2, 1, 'Footer'),
    ];
    sendOperations(ws!, ops);
    await sleep(200);

    const resp = await sendIpcCommand(socketPath, {
      type: 'find',
      name: 'user',
    });
    expect(resp.ok).toBe(true);

    const results = resp.data as Array<{ displayName: string }>;
    expect(results).toHaveLength(2);
    const names = results.map((r) => r.displayName).sort();
    expect(names).toEqual(['UserCard', 'UserProfile']);
  });

  it('should handle component removal', async () => {
    const ops = [
      1, 100,
      ...buildAddOp(1, 2, 0, 'App'),
      ...buildAddOp(2, 2, 1, 'Child'),
    ];
    sendOperations(ws!, ops);
    await sleep(200);

    // Verify initial state
    let resp = await sendIpcCommand(socketPath, { type: 'count' });
    expect(resp.ok).toBe(true);
    const initialCounts = resp.data as Record<string, number>;
    const initialTotal = Object.values(initialCounts).reduce(
      (a, b) => a + b,
      0,
    );
    expect(initialTotal).toBe(2);

    // Remove the child
    sendOperations(ws!, [1, 100, ...buildRemoveOp(2)]);
    await sleep(200);

    resp = await sendIpcCommand(socketPath, { type: 'count' });
    expect(resp.ok).toBe(true);
    const counts = resp.data as Record<string, number>;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(1);
  });

  it('should count components by type', async () => {
    const ops = [
      1, 100,
      ...buildAddOp(1, 2, 0, 'App'),       // function
      ...buildAddOp(2, 7, 1, 'MemoComp'),   // memo
      ...buildAddOp(3, 1, 1, 'ClassComp'),  // class
      ...buildAddOp(4, 6, 1, 'div'),        // host
    ];
    sendOperations(ws!, ops);
    await sleep(200);

    const resp = await sendIpcCommand(socketPath, { type: 'count' });
    expect(resp.ok).toBe(true);

    const counts = resp.data as Record<string, number>;
    expect(counts['function']).toBe(1);
    expect(counts['memo']).toBe(1);
    expect(counts['class']).toBe(1);
    expect(counts['host']).toBe(1);
  });

  it('should report connected app count in status', async () => {
    const resp = await sendIpcCommand(socketPath, { type: 'status' });
    expect(resp.ok).toBe(true);

    const status = resp.data as { connectedApps: number };
    expect(status.connectedApps).toBe(1);
  });
});
