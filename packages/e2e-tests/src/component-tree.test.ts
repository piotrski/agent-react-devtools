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
  buildOperations,
  rootOp,
  addOp,
  removeOp,
  ELEMENT_TYPE_CLASS,
  ELEMENT_TYPE_FUNCTION,
  ELEMENT_TYPE_HOST,
  ELEMENT_TYPE_MEMO,
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
    const ops = buildOperations(1, 100, (s) => [
      rootOp(100),
      addOp(1, ELEMENT_TYPE_FUNCTION, 100, s('App')),
      addOp(2, ELEMENT_TYPE_MEMO, 1, s('Header')),
      addOp(3, ELEMENT_TYPE_FUNCTION, 1, s('Footer')),
    ]);
    sendOperations(ws!, ops);
    await sleep(200);

    const resp = await sendIpcCommand(socketPath, { type: 'get-tree' });
    expect(resp.ok).toBe(true);

    const tree = resp.data as Array<{
      id: number;
      displayName: string;
      type: string;
      children: number[];
    }>;
    // Root + App + Header + Footer = 4
    expect(tree).toHaveLength(4);
    const app = tree.find((n) => n.displayName === 'App');
    expect(app).toBeDefined();
    expect(app!.children).toEqual([2, 3]);
  });

  it('should find components by name', async () => {
    const ops = buildOperations(1, 100, (s) => [
      rootOp(100),
      addOp(1, ELEMENT_TYPE_FUNCTION, 100, s('App')),
      addOp(2, ELEMENT_TYPE_FUNCTION, 1, s('UserProfile')),
      addOp(3, ELEMENT_TYPE_MEMO, 1, s('UserCard')),
      addOp(4, ELEMENT_TYPE_FUNCTION, 1, s('Footer')),
    ]);
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
    const ops = buildOperations(1, 100, (s) => [
      rootOp(100),
      addOp(1, ELEMENT_TYPE_FUNCTION, 100, s('App')),
      addOp(2, ELEMENT_TYPE_FUNCTION, 1, s('Child')),
    ]);
    sendOperations(ws!, ops);
    await sleep(200);

    let resp = await sendIpcCommand(socketPath, { type: 'count' });
    expect(resp.ok).toBe(true);
    const initialCounts = resp.data as Record<string, number>;
    const initialTotal = Object.values(initialCounts).reduce(
      (a, b) => a + b,
      0,
    );
    expect(initialTotal).toBe(3); // Root + App + Child

    // Remove child — need a new operations message with string table
    const removeOps = buildOperations(1, 100, () => [
      removeOp(2),
    ]);
    sendOperations(ws!, removeOps);
    await sleep(200);

    resp = await sendIpcCommand(socketPath, { type: 'count' });
    expect(resp.ok).toBe(true);
    const counts = resp.data as Record<string, number>;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(2); // Root + App
  });

  it('should count components by type', async () => {
    const ops = buildOperations(1, 100, (s) => [
      rootOp(100),
      addOp(1, ELEMENT_TYPE_FUNCTION, 100, s('App')),
      addOp(2, ELEMENT_TYPE_MEMO, 1, s('MemoComp')),
      addOp(3, ELEMENT_TYPE_CLASS, 1, s('ClassComp')),
      addOp(4, ELEMENT_TYPE_HOST, 1, s('div')),
    ]);
    sendOperations(ws!, ops);
    await sleep(200);

    const resp = await sendIpcCommand(socketPath, { type: 'count' });
    expect(resp.ok).toBe(true);

    const counts = resp.data as Record<string, number>;
    expect(counts['function']).toBe(1);
    expect(counts['memo']).toBe(1);
    expect(counts['class']).toBe(1);
    expect(counts['host']).toBe(1);
    expect(counts['other']).toBe(1); // Root
  });

  it('should report connected app count in status', async () => {
    const resp = await sendIpcCommand(socketPath, { type: 'status' });
    expect(resp.ok).toBe(true);

    const status = resp.data as { connectedApps: number };
    expect(status.connectedApps).toBe(1);
  });

  it('should clean up on disconnect', async () => {
    const ops = buildOperations(1, 100, (s) => [
      rootOp(100),
      addOp(1, ELEMENT_TYPE_FUNCTION, 100, s('App')),
    ]);
    sendOperations(ws!, ops);
    await sleep(200);

    ws!.close();
    ws = null;
    await sleep(300);

    const resp = await sendIpcCommand(socketPath, { type: 'status' });
    expect(resp.ok).toBe(true);
    const status = resp.data as { connectedApps: number; componentCount: number };
    expect(status.connectedApps).toBe(0);
    expect(status.componentCount).toBe(0);
  });
});
