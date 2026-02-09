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
  connectMockApp,
  sendOperations,
  buildAddOp,
  runCli,
  sleep,
} from './helpers.js';

describe('CLI commands (e2e)', () => {
  let stateDir: string;
  let port: number;
  let daemon: ChildProcess | null = null;
  let ws: WebSocket | null = null;

  beforeEach(async () => {
    stateDir = createTempStateDir();
    port = getTestPort();
    daemon = startDaemon(port, stateDir);
    await waitForDaemon(stateDir);
    ws = await connectMockApp(port);

    // Populate with some components
    const ops = [
      1, 100,
      ...buildAddOp(1, 2, 0, 'App'),
      ...buildAddOp(2, 7, 1, 'Header'),
      ...buildAddOp(3, 2, 1, 'UserProfile'),
      ...buildAddOp(4, 6, 1, 'div'),
    ];
    sendOperations(ws!, ops);
    await sleep(300);
  });

  afterEach(async () => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    await stopDaemon(daemon, stateDir);
    daemon = null;
    ws = null;
  });

  it('should display status', async () => {
    const result = await runCli(['status'], stateDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('running');
    expect(result.stdout).toContain(String(port));
  });

  it('should get component tree', async () => {
    const result = await runCli(['get', 'tree'], stateDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('App');
    expect(result.stdout).toContain('Header');
    expect(result.stdout).toContain('UserProfile');
  });

  it('should get tree with depth limit', async () => {
    const result = await runCli(['get', 'tree', '--depth', '0'], stateDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('App');
    // Children should not be shown at depth 0
    expect(result.stdout).not.toContain('Header');
  });

  it('should find components by name', async () => {
    const result = await runCli(['find', 'User'], stateDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('UserProfile');
  });

  it('should count components', async () => {
    const result = await runCli(['count'], stateDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('4 components');
  });

  it('should show help', async () => {
    const result = await runCli(['--help'], stateDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('Daemon:');
    expect(result.stdout).toContain('Components:');
  });
});
